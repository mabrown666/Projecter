# Projecter

Projecter is a streamlined project management system designed for clarity and operational efficiency. Built with a robust Python and Flask backend and a dynamic single-page JavaScript frontend, it provides an intuitive interface for managing complex workflows. The core of the system is organized around projects, which are broken down into individual tasks. This structure allows for detailed planning and tracking, but the application's true strength lies in its sophisticated handling of task dependencies and resource allocation, making it ideal for environments with multiple ongoing projects.

The application's design directly addresses the common challenges of managing interconnected tasks and competing resources. Each task can be linked to a dependency, enforcing a logical workflow where a step cannot begin until its prerequisite is complete. This system prevents work from proceeding out of order and provides immediate insight into what is blocking a project's progress. Furthermore, by assigning specific resources to each task, the application creates a clear picture of resource utilization. The unique "Jobs" view shifts the focus from projects to resources, presenting each resource with a consolidated list of all available, unblocked tasks assigned to them across all projects. This resource-centric perspective is invaluable for team members and managers, as it cuts through the complexity of multiple project plans to answer the simple, critical question: "What is the next thing I can work on right now?" This prevents resource conflicts and ensures that team members can efficiently transition between tasks and projects without confusion.

# Install
Clone the repository

	gh repo clone mabrown666/Projecter
	
Install the requirements

    pip install -r .\requirements.txt

Setup a blank database

	flask initdb