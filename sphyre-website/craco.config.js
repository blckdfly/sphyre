module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Add aliases for GSAP modules and other dependencies
      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        'gsap/ScrollTrigger': 'gsap/ScrollTrigger.js',
        'gsap/SplitText': 'gsap/SplitText.js',
        'gsap/ScrambleTextPlugin': 'gsap/ScrambleTextPlugin.js',
        'gsap/Observer': 'gsap/Observer.js',
        'gsap/InertiaPlugin': 'gsap/InertiaPlugin.js'
      };
      
      // Make sure we have fallbacks for any missing modules
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        'ogl': require.resolve('ogl')
      };
      
      return webpackConfig;
    },
  },
};