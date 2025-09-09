document.addEventListener('DOMContentLoaded', function () {
    // --- STATE ---
    let allProjects = [];
    let allResources = [];
    let newTaskResources = [];
    
    // --- SELECTORS ---
    const projectViewArea = document.getElementById('project-view-area');
    const newProjectBtn = document.getElementById('new-project-btn');
    const projectsMenuBtn = document.getElementById('projects-menu-btn');
    const jobsMenuBtn = document.getElementById('jobs-menu-btn');
    const resourcesMenuBtn = document.getElementById('resources-menu-btn');
    const popupContainer = document.getElementById('popup-container');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const themeStylesheet = document.getElementById('theme-stylesheet');

    // --- API HELPERS ---
    const api = {
        get: (url) => fetch(url).then(res => res.ok ? res.json() : Promise.reject(res)),
        post: (url, data) => fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }).then(res => res.ok ? res.json() : Promise.reject(res)),
        put: (url, data) => fetch(url, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) }).then(res => res.ok ? res.json() : Promise.reject(res)),
        delete: (url) => fetch(url, { method: 'DELETE' }).then(res => res.ok ? res.json() : Promise.reject(res)),
    };

    // --- RENDER & LOGIC FUNCTIONS ---

    const setActiveMenuButton = (activeBtn) => {
        [projectsMenuBtn, jobsMenuBtn, resourcesMenuBtn].forEach(btn => {
            btn.classList.remove('active');
        });
        activeBtn.classList.add('active');
    };
    
    const renderProjects = (filterText = '') => {
        const lowerFilterText = filterText.toLowerCase();
        const filteredProjects = allProjects.filter(p => 
            p.Description.toLowerCase().includes(lowerFilterText) ||
            (p.tasks && p.tasks.some(t => t.Description.toLowerCase().includes(lowerFilterText)))
        );
        
        const buckets = [...new Set(allProjects.map(p => p.Bucket || 'Uncategorized'))].sort();
        const filteredProjectIds = new Set(filteredProjects.map(p => p.ProjectID));

        projectViewArea.innerHTML = buckets.map(bucket => {
            const projectsInBucket = allProjects.filter(p => 
                (p.Bucket || 'Uncategorized') === bucket && filteredProjectIds.has(p.ProjectID)
            );

            if (projectsInBucket.length === 0) return '';

            return `
                <div class="project-column">
                    <h2>${bucket}</h2>
                    ${projectsInBucket.map(project => `
                        <div class="project-card" data-project-id="${project.ProjectID}">
                            <h3 data-project-id="${project.ProjectID}">${project.Description}</h3>
                            <div class="project-card-task-list">
                                ${project.tasks && project.tasks.length > 0 ? 
                                    `<ul>${project.tasks.map(task => `<li data-task-id="${task.TaskID}">${task.Description} (${task.status})</li>`).join('')}</ul>` : 
                                    '<p class="no-tasks-text">No tasks</p>'
                                }
                            </div>
                            <p class="possible-date">${project.possible_date}</p>
                        </div>
                    `).join('')}
                </div>
            `;
        }).join('');
    };
    
    const renderJobsPopup = (jobsData) => {
        popupContainer.innerHTML = `
            <div class="popup-overlay" id="jobs-popup">
                <div class="popup-content">
                    <div class="popup-header"><h2>Jobs Board</h2></div>
                    <div class="popup-body">
                        ${jobsData.map(resource => `
                            <div class="jobs-resource-group">
                                <h3>${resource.Description}</h3>
                                <div class="jobs-task-list">
                                    ${resource.tasks.length > 0 ? resource.tasks.map(task => `
                                        <div class="jobs-task-item" data-task-id="${task.TaskID}" data-project-id="${task.ProjectID}">
                                            <strong>${task.Description}</strong> (Status: ${task.status})
                                            <div class="jobs-task-item-project">Project: ${task.ProjectDescription}</div>
                                        </div>
                                    `).join('') : '<p>No available jobs for this resource.</p>'}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="popup-footer">
                        <div class="right">
                            <button class="btn btn-primary" id="jobs-done-btn">Done</button>
                        </div>
                    </div>
                </div>
            </div>`;
    };

    const renderResourcePopup = async () => {
        allResources = await api.get('/api/resources');
        popupContainer.innerHTML = `
            <div class="popup-overlay" id="resource-manager-popup">
                <div class="popup-content">
                    <div class="popup-header"><h2>Manage Resources</h2><button class="close-popup-btn">✖</button></div>
                    <div class="popup-body">
                        <div class="form-group" style="display:flex; gap: 10px;">
                            <input type="text" id="new-resource-name" class="form-control" placeholder="New resource name">
                            <button id="add-resource-btn" class="btn btn-primary">Add</button>
                        </div>
                        <div id="resource-list">
                            ${allResources.map(r => `<div class="list-item"><span class="item-text">${r.Description}</span><button class="delete-icon-btn" data-resource-id="${r.ResourceID}">✖</button></div>`).join('')}
                        </div>
                    </div>
                    <div class="popup-footer"><div class="right"><button class="btn btn-primary close-popup-btn">Done</button></div></div>
                </div>
            </div>`;
    };

    const renderProjectEditPopup = async (projectId = null) => {
        const isNew = projectId === null;
        const project = isNew ? { Description: '', Bucket: '', Notes: '' } : await api.get(`/api/project/${projectId}`);
        const tasks = isNew ? [] : await api.get(`/api/project/${projectId}/tasks`);

        popupContainer.innerHTML = `
            <div class="popup-overlay" id="edit-project-popup">
                <div class="popup-content" data-project-id="${projectId || ''}">
                    <div class="popup-header"><h2>${isNew ? 'New Project' : 'Edit Project'}</h2></div>
                    <div class="popup-body">
                        <div class="form-group"><label for="project-name">Project Name</label><input type="text" id="project-name" class="form-control" value="${project.Description || ''}" required></div>
                        <div class="form-group"><label for="project-bucket">Bucket</label><input type="text" id="project-bucket" class="form-control" value="${project.Bucket || ''}"></div>
                        <div class="form-group"><label for="project-notes">Notes</label><textarea id="project-notes" class="form-control">${project.Notes || ''}</textarea></div>
                        <div class="task-list-header"><h4>Tasks</h4><button id="add-task-btn" class="add-icon-btn" title="Add New Task">+</button></div>
                        <div id="project-tasks-list">
                            ${tasks.length > 0 ? tasks.map(t => `<div class="list-item" data-task-id="${t.TaskID}"><span class="item-text">${t.Description}</span><button class="delete-icon-btn task-delete-btn" data-task-id="${t.TaskID}">✖</button></div>`).join('') : '<p>No tasks yet.</p>'}
                        </div>
                    </div>
                    <div class="popup-footer">
                        <div class="left">${!isNew ? '<button class="btn btn-danger" id="delete-project-btn">Delete</button>' : ''}</div>
                        <div class="right"><button class="btn btn-secondary" id="cancel-project-btn">Cancel</button><button class="btn btn-primary" id="save-project-btn">Save</button></div>
                    </div>
                </div>
            </div>`;
    };

    const renderTaskEditPopup = async (taskId = null, projectId) => {
        const isNew = taskId === null;
        const task = isNew ? { Description: '', Notes: '', Duration: 1, ProjectID: projectId } : await api.get(`/api/task/${taskId}`);
        
        if (isNew) {
            newTaskResources = [];
        } else {
            newTaskResources = await api.get(`/api/task/${taskId}/resources`);
        }
        
        const allProjectsForSelect = await api.get('/api/projects');
        const tasksInProject = await api.get(`/api/project/${task.ProjectID}/tasks`);

        let statusText = "Not Started";
        if (task.Completed) statusText = `Completed ${new Date(task.Completed).toLocaleString()}`;
        else if (task.Started) statusText = `Started ${new Date(task.Started).toLocaleString()}`;

        const taskPopup = document.createElement('div');
        taskPopup.classList.add('popup-overlay');
        taskPopup.id = 'edit-task-popup';
        taskPopup.innerHTML = `
            <div class="popup-content" data-task-id="${taskId || ''}" data-project-id="${task.ProjectID}">
                <div class="popup-header"><h2>${isNew ? 'New Task' : 'Edit Task'}</h2></div>
                <div class="popup-body">
                     <div class="form-group"><label for="task-name">Task Name</label><input type="text" id="task-name" class="form-control" value="${task.Description || ''}" required></div>
                     <div class="form-group"><label for="task-project">Project</label><select id="task-project" class="form-select">${allProjectsForSelect.map(p => `<option value="${p.ProjectID}" ${p.ProjectID === task.ProjectID ? 'selected' : ''}>${p.Description}</option>`).join('')}</select></div>
                     <div class="form-group"><label for="task-notes">Notes</label><textarea id="task-notes" class="form-control">${task.Notes || ''}</textarea></div>
                     <div class="form-group"><label for="task-dependency">Dependency</label><select id="task-dependency" class="form-select"><option value="">None</option>${tasksInProject.filter(t => t.TaskID !== taskId).map(t => `<option value="${t.TaskID}" ${t.TaskID === task.DependentTaskID ? 'selected' : ''}>${t.Description}</option>`).join('')}</select></div>
                     <div class="form-group"><label for="task-duration">Duration (days)</label><input type="number" id="task-duration" class="form-control" value="${task.Duration || 1}" min="0.1" step="0.1"></div>
                     <div class="resource-list-header"><h4>Required Resources</h4><button id="add-resource-to-task-btn" class="add-icon-btn" title="Add Resource">+</button></div>
                     <div id="task-resources-list">
                        ${newTaskResources.length > 0 ? newTaskResources.map(r => `<div class="list-item"><span class="item-text">${r.Description}</span><button class="delete-icon-btn remove-resource-from-task-btn" data-resource-id="${r.ResourceID}">✖</button></div>`).join('') : '<p>No resources required.</p>'}
                     </div>
                     <p id="task-status">Status: ${statusText}</p>
                </div>
                <div class="popup-footer">
                    <div class="left">${!isNew ? '<button class="btn btn-danger" id="delete-task-btn">Delete</button>' : ''}</div>
                    <div class="right">
                        <button class="btn btn-secondary" id="cancel-task-btn">Cancel</button>
                        ${!isNew && !task.Started ? '<button class="btn btn-success" id="start-task-btn">Start Now</button>' : ''}
                        ${!isNew && task.Started && !task.Completed ? '<button class="btn btn-success" id="finish-task-btn">Finish Now</button>' : ''}
                        <button class="btn btn-primary" id="save-task-btn">Save</button>
                    </div>
                </div>
            </div>`;
        popupContainer.appendChild(taskPopup);
    };

    const renderResourceSelectionPopup = async (existingResourceIds) => {
        const allResources = await api.get('/api/resources');
        const availableResources = allResources.filter(r => !existingResourceIds.includes(r.ResourceID));
        
        const selectionPopup = document.createElement('div');
        selectionPopup.classList.add('popup-overlay');
        selectionPopup.id = 'resource-selection-popup';
        selectionPopup.innerHTML = `
            <div class="popup-content" style="max-width: 400px;">
                <div class="popup-header"><h4>Select a Resource</h4></div>
                <div class="popup-body">
                    <div id="available-resources-list">
                        ${availableResources.length > 0 ? availableResources.map(r => `<div class="list-item select-resource-item" data-resource-id="${r.ResourceID}" data-resource-name="${r.Description}">${r.Description}</div>`).join('') : '<p>No more resources available to add.</p>'}
                    </div>
                </div>
                <div class="popup-footer"><div class="right"><button class="btn btn-secondary" id="cancel-resource-select">Cancel</button></div></div>
            </div>`;
        popupContainer.appendChild(selectionPopup);
    };

    // --- EVENT LISTENERS ---
    
    newProjectBtn.addEventListener('click', () => renderProjectEditPopup());

    projectsMenuBtn.addEventListener('click', e => {
        e.preventDefault();
        setActiveMenuButton(projectsMenuBtn);
        popupContainer.innerHTML = '';
        loadProjects();
    });

    jobsMenuBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        setActiveMenuButton(jobsMenuBtn);
        popupContainer.innerHTML = ''; 
        const jobsData = await api.get('/api/jobs');
        renderJobsPopup(jobsData);
    });

    resourcesMenuBtn.addEventListener('click', e => {
        e.preventDefault();
        setActiveMenuButton(resourcesMenuBtn);
        popupContainer.innerHTML = '';
        renderResourcePopup();
    });

    document.getElementById('search-input').addEventListener('input', e => renderProjects(e.target.value));
    
    darkModeToggle.addEventListener('change', () => { 
        themeStylesheet.href = darkModeToggle.checked ? 'css/dark.css' : 'css/style.css'; 
        localStorage.setItem('darkMode', darkModeToggle.checked);
    });

    document.addEventListener('click', async (e) => {
        if (e.target.matches('.project-card-task-list li')) {
            const taskItem = e.target;
            const taskId = parseInt(taskItem.dataset.taskId);
            const projectId = parseInt(taskItem.closest('.project-card').dataset.projectId);
            await renderProjectEditPopup(projectId);
            await renderTaskEditPopup(taskId, projectId);
            return;
        }

        if (e.target.closest('.jobs-task-item')) {
            const taskItem = e.target.closest('.jobs-task-item');
            const taskId = parseInt(taskItem.dataset.taskId);
            const projectId = parseInt(taskItem.dataset.projectId);
            popupContainer.innerHTML = '';
            await renderProjectEditPopup(projectId);
            await renderTaskEditPopup(taskId, projectId);
            return;
        }

        if (e.target.matches('.project-card h3')) { 
            renderProjectEditPopup(parseInt(e.target.dataset.projectId)); 
        }
        
        if (e.target.id === 'jobs-done-btn') {
            popupContainer.innerHTML = '';
            projectsMenuBtn.click();
        }
        
        if (e.target.matches('.close-popup-btn') && e.target.closest('#resource-manager-popup')) { projectsMenuBtn.click(); }
        if (e.target.id === 'add-resource-btn') { const input = document.getElementById('new-resource-name'); if (input.value) { await api.post('/api/resources', { Description: input.value }); renderResourcePopup(); } }
        if (e.target.matches('#resource-list .delete-icon-btn')) { if (confirm('Are you sure? This removes the resource from all tasks.')) { await api.delete(`/api/resource/${e.target.dataset.resourceId}`); renderResourcePopup(); } }
        if (e.target.id === 'cancel-project-btn') { document.getElementById('edit-project-popup').remove(); }
        if (e.target.id === 'save-project-btn') { const popup = e.target.closest('.popup-content'); const nameInput = document.getElementById('project-name'); if (!nameInput.value.trim()) { alert('Project Name is required.'); return; } const projectId = popup.dataset.projectId; const data = { Description: nameInput.value, Bucket: document.getElementById('project-bucket').value, Notes: document.getElementById('project-notes').value }; if (projectId) { await api.put(`/api/project/${projectId}`, data); } else { await api.post('/api/project', data); } popup.parentElement.remove(); loadProjects(); }
        if (e.target.id === 'delete-project-btn') { if (confirm('Delete this project and ALL its tasks?')) { await api.delete(`/api/project/${e.target.closest('.popup-content').dataset.projectId}`); e.target.closest('.popup-overlay').remove(); loadProjects(); } }
        if (e.target.id === 'add-task-btn') { const projectId = e.target.closest('.popup-content').dataset.projectId; if (!projectId) { alert('Please save the project first.'); return; } renderTaskEditPopup(null, parseInt(projectId)); }
        if (e.target.matches('.task-delete-btn')) { if (confirm('Delete this task?')) { const taskId = e.target.dataset.taskId; const projectId = e.target.closest('.popup-content').dataset.projectId; await api.delete(`/api/task/${taskId}`); document.getElementById('edit-project-popup').remove(); renderProjectEditPopup(parseInt(projectId)); } }
        if (e.target.closest('#project-tasks-list .list-item') && !e.target.matches('.task-delete-btn')) { const item = e.target.closest('.list-item'); renderTaskEditPopup(parseInt(item.dataset.taskId), parseInt(item.closest('.popup-content').dataset.projectId)); }
        if (e.target.id === 'cancel-task-btn') { document.getElementById('edit-task-popup').remove(); }
        if (e.target.id === 'save-task-btn') { const popup = e.target.closest('.popup-content'); const nameInput = document.getElementById('task-name'); if (!nameInput.value.trim()) { alert('Task Name is required.'); return; } const taskId = popup.dataset.taskId; const originalProjectId = popup.dataset.projectId; const taskData = { Description: nameInput.value, ProjectID: parseInt(document.getElementById('task-project').value), Notes: document.getElementById('task-notes').value, Duration: parseFloat(document.getElementById('task-duration').value) || 1, DependentTaskID: document.getElementById('task-dependency').value ? parseInt(document.getElementById('task-dependency').value) : null }; if (taskId) { const existingTask = await api.get(`/api/task/${taskId}`); taskData.Started = existingTask.Started; taskData.Completed = existingTask.Completed; await api.put(`/api/task/${taskId}`, taskData); } else { taskData.ResourceIDs = newTaskResources.map(r => r.ResourceID); await api.post('/api/task', taskData); } popup.parentElement.remove(); document.getElementById('edit-project-popup')?.remove(); renderProjectEditPopup(parseInt(originalProjectId)); loadProjects(); }
        if (e.target.id === 'delete-task-btn') { if (confirm('Delete this task?')) { const popup = e.target.closest('.popup-content'); await api.delete(`/api/task/${popup.dataset.taskId}`); popup.parentElement.remove(); document.getElementById('edit-project-popup')?.remove(); renderProjectEditPopup(parseInt(popup.dataset.projectId)); } }
        if (e.target.id === 'start-task-btn' || e.target.id === 'finish-task-btn') { const taskId = e.target.closest('.popup-content').dataset.taskId; if (e.target.id === 'start-task-btn') await api.post(`/api/task/${taskId}/start`); else await api.post(`/api/task/${taskId}/finish`); document.getElementById('save-task-btn').click(); }
        if (e.target.id === 'add-resource-to-task-btn') { const existingResourceIds = newTaskResources.map(r => r.ResourceID); renderResourceSelectionPopup(existingResourceIds); }
        if (e.target.matches('.remove-resource-from-task-btn')) { const resourceIdToRemove = parseInt(e.target.dataset.resourceId); const taskPopup = e.target.closest('.popup-content'); const taskId = taskPopup.dataset.taskId; if (taskId) { await api.delete(`/api/task/${taskId}/resource/${resourceIdToRemove}`); } newTaskResources = newTaskResources.filter(r => r.ResourceID !== resourceIdToRemove); document.getElementById('task-resources-list').innerHTML = newTaskResources.length > 0 ? newTaskResources.map(r => `<div class="list-item"><span class="item-text">${r.Description}</span><button class="delete-icon-btn remove-resource-from-task-btn" data-resource-id="${r.ResourceID}">✖</button></div>`).join('') : '<p>No resources required.</p>'; }
        if (e.target.id === 'cancel-resource-select') { document.getElementById('resource-selection-popup').remove(); }
        if (e.target.matches('.select-resource-item')) { const resourceId = parseInt(e.target.dataset.resourceId); const resourceName = e.target.dataset.resourceName; const taskId = document.getElementById('edit-task-popup').querySelector('.popup-content').dataset.taskId; if (taskId) { await api.post(`/api/task/${taskId}/resources`, { ResourceID: resourceId }); } newTaskResources.push({ ResourceID: resourceId, Description: resourceName }); document.getElementById('task-resources-list').innerHTML = newTaskResources.map(r => `<div class="list-item"><span class="item-text">${r.Description}</span><button class="delete-icon-btn remove-resource-from-task-btn" data-resource-id="${r.ResourceID}">✖</button></div>`).join(''); document.getElementById('resource-selection-popup').remove(); }

    });

    // --- INITIALIZATION ---
    const initialize = () => {
        const isDarkMode = localStorage.getItem('darkMode') === 'true';
        darkModeToggle.checked = isDarkMode;
        themeStylesheet.href = isDarkMode ? 'css/dark.css' : 'css/style.css';
        loadProjects();
    }

    const loadProjects = async () => { 
        try { 
            allProjects = await api.get('/api/projects'); 
            renderProjects(); 
        } catch (error) { 
            console.error("Failed to load projects:", error); 
            projectViewArea.innerHTML = "<p>Could not load projects. Is the server running?</p>"; 
        } 
    };
    
    initialize();
});