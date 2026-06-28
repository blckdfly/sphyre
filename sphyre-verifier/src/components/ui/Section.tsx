'use client';

import React from 'react';

interface SectionProps {
    title: string;
    children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
    <div className="mb-8">
        <h2 className="text-dark-300 text-sm font-medium mb-4 px-6">{title}</h2>
        <div className="bg-light-50">
            <div className="px-6 divide-y divide-gray-100">
                {children}
            </div>
        </div>
    </div>
);

export default Section;