# Sphyre Website

A modern, responsive multi-page website for the Sphyre ecosystem that showcases the three main applications: Sphyre App, Sphyre Issuers, and Sphyre Verifier. The website also highlights the Fortro Engine backend technology that powers the entire ecosystem.

## Features

- **Multi-Page Structure**: Separate pages for Home, Applications, About, Contact, and Fortro Engine
- **Modern Design**: Clean, professional interface with animations and visual effects
- **Responsive Layout**: Optimized for all device sizes from mobile to desktop
- **Interactive Elements**: Animated cards, gradient text, and hover effects
- **Application Showcase**: Dedicated pages for each Sphyre application
- **Fortro Engine Integration**: Detailed information about the backend technology
- **Optimized Performance**: Fast loading with minimal dependencies
- **Accessibility**: Semantic HTML and proper contrast ratios

## Installation and Setup

1. Install dependencies:
   ```
   npm install --legacy-peer-deps
   ```

2. Install additional dependencies for ReactBits and routing:
   ```
   npm install @emotion/react @emotion/styled ogl react-router-dom --legacy-peer-deps
   ```

3. Run the development server:
   ```
   npm start
   ```

4. Navigate to different pages using the navigation menu or direct URLs:
   - Home: `/`
   - Applications: `/applications`
   - About: `/about`
   - Contact: `/contact`
   - Fortro Engine: `/fortro-engine`

## Troubleshooting

### GSAP Module Resolution Issues

If you encounter errors related to GSAP modules not being found, the project has been configured with a custom webpack configuration using CRACO to resolve these issues. The configuration is in `craco.config.js`.

### ReactBits Component Issues

A patch file has been created at `src/reactbits-patch.js` that provides mock implementations of ReactBits components. This allows the website to run even if there are issues with the ReactBits library.

### Dependency Conflicts

This project uses `--legacy-peer-deps` to handle dependency conflicts, particularly with Three.js versions. If you encounter dependency issues, try using this flag with npm commands.

For example, to install react-router-dom or any other package with dependency conflicts:
```
npm install react-router-dom --legacy-peer-deps
```

The main conflict is between @appletosolutions/reactbits (which requires three.js v0.150.0) and other dependencies that require three.js v0.179.1 or newer. Using the --legacy-peer-deps flag allows npm to ignore these peer dependency conflicts.

## Project Structure

- `src/AppRouter.jsx`: Main router component that handles navigation between pages
- `src/pages/`: Directory containing individual page components
  - `src/pages/HomePage.jsx`: Home page component
  - `src/pages/ApplicationsPage.jsx`: Applications showcase page
  - `src/pages/AboutPage.jsx`: About page component
  - `src/pages/ContactPage.jsx`: Contact page with form
  - `src/pages/FortroEnginePage.jsx`: Fortro Engine details page
- `src/App.js`: Original single-page application (now replaced by AppRouter)
- `src/App.css`: Comprehensive styles for all pages including responsive design
- `src/reactbits-patch.js`: Enhanced implementations of ReactBits components with animations
- `src/index.js`: Entry point for the React application
- `src/index.css`: Global CSS styles and utility classes
- `public/index.html`: HTML template with meta tags and font imports
- `craco.config.js`: Custom webpack configuration for dependency resolution

## Available Scripts

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
