'use client';

import React from 'react';

interface DataFieldsProps {
    fields: string[];
    label?: string;
}

const DataFields: React.FC<DataFieldsProps> = ({ 
    fields,
    label = "Driver License" 
}) => (
    <div className="mt-3">
        <div className="flex justify-between items-start">
            <span className="text-gray-500 text-sm">{label}</span>
            <div className="text-right text-sm text-gray-700 space-y-1">
                {fields.map((field, index) => (
                    <div key={index}>{field}</div>
                ))}
            </div>
        </div>
    </div>
);

export default DataFields;