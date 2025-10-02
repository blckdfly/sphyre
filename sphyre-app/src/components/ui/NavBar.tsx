import React from 'react';

interface NavBarProps {
    title: string;
    children?: React.ReactNode;
}

const NavBar: React.FC<NavBarProps> = ({ title, children }) => {
    return (
        <div className="flex items-center justify-between p-4 bg-black">
            <div className="text-sm">{title}</div>
            {children && <div>{children}</div>}
        </div>
    );
};

export default NavBar;