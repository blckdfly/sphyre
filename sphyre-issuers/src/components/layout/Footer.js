import React from 'react';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 md:flex md:items-center md:justify-between lg:px-8">
        <div className="flex justify-center space-x-6 md:order-2">
          <button type="button" className="text-gray-400 hover:text-gray-500">
            <span className="sr-only">Help</span>
            <span className="text-sm text-gray-500 hover:text-gray-900">Help</span>
          </button>
          <button type="button" className="text-gray-400 hover:text-gray-500">
            <span className="sr-only">Privacy</span>
            <span className="text-sm text-gray-500 hover:text-gray-900">Privacy</span>
          </button>
          <button type="button" className="text-gray-400 hover:text-gray-500">
            <span className="sr-only">Terms</span>
            <span className="text-sm text-gray-500 hover:text-gray-900">Terms</span>
          </button>
        </div>
        <div className="mt-4 md:mt-0 md:order-1">
          <p className="text-center text-sm text-gray-500">
            &copy; {currentYear} <span className="tracking-wide">S<span className="tracking-normal">phyre</span></span>. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;