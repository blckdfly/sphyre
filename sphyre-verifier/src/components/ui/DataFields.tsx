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
            <span className="text-dark-300 text-sm">{label}</span>
            <div className="text-right text-sm text-dark-500 space-y-1">
                {fields.map((field, index) => (
                    <div key={index}>{field}</div>
                ))}
            </div>
        </div>
    </div>
);

export default DataFields;