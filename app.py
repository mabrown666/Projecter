import sqlite3
import json
from flask import Flask, jsonify, request, g, send_from_directory
from datetime import datetime, timedelta

app = Flask(__name__, static_url_path='', static_folder='static')

def get_db():
    if 'db' not in g:
        with open('config.json') as f:
            config = json.load(f)
        g.db = sqlite3.connect(config['database']['name'])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        with app.open_resource('schema.sql', mode='r') as f:
            db.cursor().executescript(f.read())
        db.commit()
    print("Initialized the database.")

@app.cli.command('initdb')
def initdb_command():
    init_db()

# --- Backend Logic Functions ---

def calculate_possible_date(project_id, db):
    # Find the latest estimated end date of active tasks
    active_tasks_cursor = db.execute(
        'SELECT Started, Duration FROM Tasks WHERE ProjectID = ? AND Started IS NOT NULL AND Completed IS NULL',
        (project_id,)
    )
    active_tasks = active_tasks_cursor.fetchall()

    start_date = datetime.now()
    if active_tasks:
        latest_end_date = None
        for task in active_tasks:
            started_date = datetime.fromisoformat(task['Started'])
            duration = task['Duration']
            estimated_end_date = started_date + timedelta(days=duration)

            if latest_end_date is None or estimated_end_date > latest_end_date:
                latest_end_date = estimated_end_date

        if latest_end_date is not None and latest_end_date > start_date:
            start_date = latest_end_date

    total_duration = 0
    # Calculate the total duration of unstarted tasks

    unstarted_tasks_cursor = db.execute(
        'SELECT SUM(Duration) FROM Tasks WHERE ProjectID = ? AND Started IS NULL',
        (project_id,)
    )
    unstarted_tasks_result = unstarted_tasks_cursor.fetchone()
    total_duration = unstarted_tasks_result[0] if unstarted_tasks_result[0] is not None else 0

    if total_duration > 0:
        completion_date = start_date + timedelta(days=total_duration)
        return f"Possible completion: {completion_date.strftime('%Y-%m-%d')}"

    elif active_tasks:
        return f"Possible completion: {start_date.strftime('%Y-%m-%d')}"

    return "All tasks completed"

# --- API Endpoints ---

@app.route('/api/jobs', methods=['GET'])
def get_jobs():
    db = get_db()
    
    all_resources = [dict(row) for row in db.execute('SELECT * FROM Resources ORDER BY Description').fetchall()]
    uncompleted_tasks_rows = db.execute('''
        SELECT T.*, P.Description as ProjectDescription
        FROM Tasks T
        JOIN Project P ON T.ProjectID = P.ProjectID
        WHERE T.Completed IS NULL
    ''').fetchall()
    
    tasks_map = {row['TaskID']: dict(row) for row in uncompleted_tasks_rows}
    required_resources = db.execute('SELECT * FROM RequiredResources').fetchall()

    tasks_by_resource_id = {res['ResourceID']: [] for res in all_resources}
    for link in required_resources:
        task_id = link['TaskID']
        resource_id = link['ResourceID']
        if task_id in tasks_map:
            tasks_by_resource_id[resource_id].append(tasks_map[task_id])

    jobs_data = []
    for resource in all_resources:
        job_resource = {
            'ResourceID': resource['ResourceID'],
            'Description': resource['Description'],
            'tasks': []
        }
        
        for task in tasks_by_resource_id[resource['ResourceID']]:
            dep_id = task.get('DependentTaskID')
            if dep_id and dep_id in tasks_map:
                continue

            status = 'Active' if task.get('Started') else 'Waiting'
            
            job_resource['tasks'].append({
                'TaskID': task['TaskID'],
                'ProjectID': task['ProjectID'], # CORRECTED: Added ProjectID to the response
                'Description': task['Description'],
                'ProjectDescription': task['ProjectDescription'],
                'status': status
            })
        
        jobs_data.append(job_resource)

    return jsonify(jobs_data)


# ... (The rest of app.py is unchanged) ...
@app.route('/api/projects', methods=['GET'])
def get_projects():
    db = get_db()
    projects_cur = db.execute('SELECT * FROM Project ORDER BY Description')
    projects = [dict(row) for row in projects_cur.fetchall()]
    tasks_cur = db.execute('SELECT TaskID, ProjectID, Description, Started, Completed, DependentTaskID FROM Tasks ORDER BY TaskID')
    all_tasks = [dict(row) for row in tasks_cur.fetchall()]
    tasks_map = {task['TaskID']: task for task in all_tasks}

    tasks_by_project = {}
    for task in all_tasks:
        if task['Completed']:
            task['status'] = 'Completed'
        elif task['Started']:
            task['status'] = 'Active'
        elif task['DependentTaskID'] and tasks_map.get(task['DependentTaskID']) and not tasks_map[task['DependentTaskID']]['Completed']:
            task['status'] = 'Dependent'
        else:
            task['status'] = 'Awaiting resource'
        
        pid = task['ProjectID']
        if pid not in tasks_by_project:
            tasks_by_project[pid] = []
        tasks_by_project[pid].append(task)

    for project in projects:
        project['tasks'] = tasks_by_project.get(project['ProjectID'], [])
        project['possible_date'] = calculate_possible_date(project['ProjectID'], db)
        
    return jsonify(projects)

@app.route('/api/project', methods=['POST'])
def add_project():
    data = request.get_json()
    db = get_db()
    cursor = db.execute('INSERT INTO Project (Description, Bucket, Notes) VALUES (?, ?, ?)',
               [data['Description'], data['Bucket'], data['Notes']])
    db.commit()
    new_project_id = cursor.lastrowid
    new_project = {
        'ProjectID': new_project_id,
        'Description': data['Description'],
        'Bucket': data['Bucket'],
        'Notes': data['Notes'],
        'tasks': [],
        'possible_date': calculate_possible_date(new_project_id, db)
    }
    return jsonify(new_project), 201


@app.route('/api/project/<int:project_id>', methods=['GET', 'PUT', 'DELETE'])
def manage_project(project_id):
    db = get_db()
    if request.method == 'GET':
        cur = db.execute('SELECT * FROM Project WHERE ProjectID = ?', [project_id])
        project = cur.fetchone()
        return jsonify(dict(project)) if project else ('', 404)
    elif request.method == 'PUT':
        data = request.get_json()
        db.execute('UPDATE Project SET Description = ?, Bucket = ?, Notes = ? WHERE ProjectID = ?',
                   [data['Description'], data['Bucket'], data['Notes'], project_id])
        db.commit()
        return jsonify({'status': 'success'})
    elif request.method == 'DELETE':
        db.execute('DELETE FROM Project WHERE ProjectID = ?', [project_id])
        db.commit()
        return jsonify({'status': 'success'})

@app.route('/api/project/<int:project_id>/tasks', methods=['GET'])
def get_project_tasks(project_id):
    db = get_db()
    cur = db.execute('SELECT * FROM Tasks WHERE ProjectID = ? ORDER BY TaskID', [project_id])
    tasks = [dict(row) for row in cur.fetchall()]
    return jsonify(tasks)
    
@app.route('/api/task', methods=['POST'])
def add_task():
    data = request.get_json()
    db = get_db()
    try:
        db.execute('BEGIN')
        cursor = db.execute('INSERT INTO Tasks (ProjectID, Description, Notes, Duration, DependentTaskID) VALUES (?, ?, ?, ?, ?)',
                   [data['ProjectID'], data['Description'], data['Notes'], data['Duration'], data.get('DependentTaskID')])
        
        new_task_id = cursor.lastrowid
        
        resource_ids = data.get('ResourceIDs', [])
        if resource_ids:
            for resource_id in resource_ids:
                db.execute('INSERT INTO RequiredResources (TaskID, ResourceID) VALUES (?, ?)', (new_task_id, resource_id))

        db.commit()
        return jsonify({'status': 'success', 'TaskID': new_task_id})
    except Exception as e:
        db.rollback()
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/task/<int:task_id>', methods=['GET', 'PUT', 'DELETE'])
def manage_task(task_id):
    db = get_db()
    if request.method == 'GET':
        cur = db.execute('SELECT * FROM Tasks WHERE TaskID = ?', [task_id])
        task = cur.fetchone()
        return jsonify(dict(task)) if task else ('', 404)
    elif request.method == 'PUT':
        data = request.get_json()
        db.execute('''UPDATE Tasks SET ProjectID = ?, Description = ?, Notes = ?, Duration = ?, Started = ?, Completed = ?, DependentTaskID = ?
                      WHERE TaskID = ?''',
                   [data['ProjectID'], data['Description'], data['Notes'], data['Duration'],
                    data.get('Started'), data.get('Completed'), data.get('DependentTaskID'), task_id])
        db.commit()
        return jsonify({'status': 'success'})
    elif request.method == 'DELETE':
        db.execute('DELETE FROM Tasks WHERE TaskID = ?', [task_id])
        db.commit()
        return jsonify({'status': 'success'})

@app.route('/api/task/<int:task_id>/start', methods=['POST'])
def start_task(task_id):
    db = get_db()
    db.execute('UPDATE Tasks SET Started = ?, Completed = NULL WHERE TaskID = ?', [datetime.now().isoformat(), task_id])
    db.commit()
    return jsonify({'status': 'success', 'started_date': datetime.now().isoformat()})

@app.route('/api/task/<int:task_id>/finish', methods=['POST'])
def finish_task(task_id):
    db = get_db()
    db.execute('UPDATE Tasks SET Completed = ? WHERE TaskID = ?', [datetime.now().isoformat(), task_id])
    db.commit()
    return jsonify({'status': 'success', 'completed_date': datetime.now().isoformat()})

@app.route('/api/resources', methods=['GET', 'POST'])
def manage_resources():
    db = get_db()
    if request.method == 'GET':
        cur = db.execute('SELECT * FROM Resources ORDER BY Description')
        resources = [dict(row) for row in cur.fetchall()]
        return jsonify(resources)
    elif request.method == 'POST':
        data = request.get_json()
        try:
            cursor = db.execute('INSERT INTO Resources (Description) VALUES (?)', [data['Description']])
            db.commit()
            return jsonify({'status': 'success', 'ResourceID': cursor.lastrowid})
        except sqlite3.IntegrityError:
            return jsonify({'status': 'error', 'message': 'Resource already exists'}), 409

@app.route('/api/resource/<int:resource_id>', methods=['DELETE'])
def delete_resource(resource_id):
    db = get_db()
    db.execute('DELETE FROM Resources WHERE ResourceID = ?', [resource_id])
    db.commit()
    return jsonify({'status': 'success'})

@app.route('/api/task/<int:task_id>/resources', methods=['GET', 'POST'])
def manage_task_resources(task_id):
    db = get_db()
    if request.method == 'GET':
        cur = db.execute('''SELECT r.ResourceID, r.Description FROM RequiredResources rr
                            JOIN Resources r ON rr.ResourceID = r.ResourceID
                            WHERE rr.TaskID = ?''', [task_id])
        resources = [dict(row) for row in cur.fetchall()]
        return jsonify(resources)
    elif request.method == 'POST':
        data = request.get_json()
        db.execute('INSERT INTO RequiredResources (TaskID, ResourceID) VALUES (?, ?)', [task_id, data['ResourceID']])
        db.commit()
        return jsonify({'status': 'success'})

@app.route('/api/task/<int:task_id>/resource/<int:resource_id>', methods=['DELETE'])
def remove_task_resource(task_id, resource_id):
    db = get_db()
    db.execute('DELETE FROM RequiredResources WHERE TaskID = ? AND ResourceID = ?', [task_id, resource_id])
    db.commit()
    return jsonify({'status': 'success'})

@app.route('/favicon.ico')
def favicon2():
    return send_from_directory(app.root_path,'favicon.ico', mimetype='image/vnd.microsoft.icon')

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

if __name__ == '__main__':
    app.run(debug=True)