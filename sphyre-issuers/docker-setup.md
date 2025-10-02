# Docker Setup for React Application

## Changes Made

The Dockerfile has been updated to properly build and serve a React application instead of a Next.js application. The key changes include:

### Dockerfile Changes

1. Updated comments to indicate it's for a React application
2. Kept the build stage similar (using `npm run build` to build the React application)
3. Changed the runner stage to use nginx:alpine instead of node
   - React applications are static after build and best served with a web server like nginx
4. Updated file paths to copy the build directory (output of React build) to nginx's html directory
5. Changed the exposed port from 3000 to 80 (standard HTTP port for nginx)
6. Updated the CMD to run nginx instead of npm start

### Added nginx.conf

Created a new nginx configuration file that:
- Properly serves the React application's static files
- Handles client-side routing with React Router by redirecting all requests to index.html
- Adds caching for static assets to improve performance
- Sets up error pages

## How to Build and Run

To build and run the Docker container:

```bash
# Build the Docker image
docker build -t sphyre-issuers .

# Run the container
docker run -p 80:80 sphyre-issuers
```

The application will be available at http://localhost

## Benefits of This Setup

1. **Optimized for Production**: Uses a lightweight nginx image to serve static files
2. **Better Performance**: nginx is more efficient at serving static content than Node.js
3. **Proper Routing Support**: Handles client-side routing correctly
4. **Smaller Image Size**: Final image is smaller as it doesn't include Node.js runtime
5. **Security**: Doesn't run as root inside the container