import React from 'react';

interface IdentityItemProps {
    title: string;
    onClick: () => void;
}

const IdentityItem: React.FC<IdentityItemProps> = ({ title, onClick }) => {
    return (
        <div
            className="w-full py-3 bg-light-200 mb-3 rounded-md flex items-center px-4 cursor-pointer"
            onClick={onClick}
        >
            <span className="text-dark-500">{title}</span>
        </div>
    );
};

export default IdentityItem;