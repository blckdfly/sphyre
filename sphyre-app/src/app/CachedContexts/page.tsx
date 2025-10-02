'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Database, Trash2, RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react';

// Sample cached contexts data
const sampleContexts = [
  {
    id: 'ctx-001',
    name: 'W3C Verifiable Credentials v1',
    url: 'https://www.w3.org/2018/credentials/v1',
    size: '24.5 KB',
    lastUpdated: '2023-10-15T14:30:00Z',
    status: 'active'
  },
  {
    id: 'ctx-002',
    name: 'DID Core Context',
    url: 'https://www.w3.org/ns/did/v1',
    size: '18.2 KB',
    lastUpdated: '2023-10-10T09:15:00Z',
    status: 'active'
  },
  {
    id: 'ctx-003',
    name: 'Sphyre Identity Schema',
    url: 'https://schemas.sphyre.com/identity/v1',
    size: '32.7 KB',
    lastUpdated: '2023-10-20T11:45:00Z',
    status: 'active'
  },
  {
    id: 'ctx-004',
    name: 'Credential Exchange Protocol',
    url: 'https://schemas.sphyre.com/exchange/v2',
    size: '15.9 KB',
    lastUpdated: '2023-09-28T16:20:00Z',
    status: 'outdated'
  },
  {
    id: 'ctx-005',
    name: 'Biometric Authentication Context',
    url: 'https://schemas.sphyre.com/biometric/v1',
    size: '41.3 KB',
    lastUpdated: '2023-10-05T08:50:00Z',
    status: 'active'
  }
];

export default function CachedContextsPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [contexts, setContexts] = useState(sampleContexts);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalSize, setTotalSize] = useState('');

  useEffect(() => {
    setMounted(true);
    
    // Calculate total size
    const total = contexts.reduce((sum, context) => {
      const sizeInKB = parseFloat(context.size.replace(' KB', ''));
      return sum + sizeInKB;
    }, 0);
    
    setTotalSize(`${total.toFixed(1)} KB`);
  }, [contexts]);

  const handleBack = () => {
    router.push('/UserProfile');
  };

  const handleRefreshAll = () => {
    setIsRefreshing(true);
    
    // Simulate refreshing contexts
    setTimeout(() => {
      // Update last updated time for all contexts
      const updatedContexts = contexts.map(context => ({
        ...context,
        lastUpdated: new Date().toISOString(),
        status: 'active'
      }));
      
      setContexts(updatedContexts);
      setIsRefreshing(false);
      
      // Show success message
      alert('All contexts refreshed successfully');
    }, 2000);
  };

  const handleDeleteContext = (id: string) => {
    // Ask for confirmation
    const confirmDelete = window.confirm('Are you sure you want to delete this cached context? You may need to download it again later.');
    
    if (confirmDelete) {
      // Remove the context from the list
      setContexts(prev => prev.filter(context => context.id !== id));
    }
  };

  const handleRefreshContext = (id: string) => {
    // Simulate refreshing a single context
    setContexts(prev => prev.map(context => 
      context.id === id 
        ? { ...context, lastUpdated: new Date().toISOString(), status: 'active' } 
        : context
    ));
    
    // Show success message
    alert(`Context ${id} refreshed successfully`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <div className="flex items-center text-green-600">
            <CheckCircle size={14} className="mr-1" />
            <span className="text-xs">Active</span>
          </div>
        );
      case 'outdated':
        return (
          <div className="flex items-center text-yellow-600">
            <AlertCircle size={14} className="mr-1" />
            <span className="text-xs">Outdated</span>
          </div>
        );
      case 'downloading':
        return (
          <div className="flex items-center text-blue-600">
            <Clock size={14} className="mr-1" />
            <span className="text-xs">Downloading</span>
          </div>
        );
      default:
        return null;
    }
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-white">
        <p className="text-black">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center border-b border-gray-200">
        <button onClick={handleBack} className="mr-3">
          <ArrowLeft size={24} className="text-black" />
        </button>
        <h1 className="text-lg font-semibold text-black">Cached Contexts</h1>
      </div>

      {/* Storage Summary */}
      <div className="px-4 py-6">
        <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Database size={20} className="text-blue-600 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Storage Summary</h2>
            </div>
            <button 
              onClick={handleRefreshAll}
              disabled={isRefreshing}
              className={`flex items-center px-3 py-1.5 rounded-lg text-sm ${
                isRefreshing 
                  ? 'bg-gray-200 text-gray-500' 
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              }`}
            >
              <RefreshCw size={14} className={`mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh All'}
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-100 rounded-lg p-3">
              <p className="text-sm text-gray-500 mb-1">Total Contexts</p>
              <p className="text-xl font-semibold text-gray-900">{contexts.length}</p>
            </div>
            <div className="bg-gray-100 rounded-lg p-3">
              <p className="text-sm text-gray-500 mb-1">Total Size</p>
              <p className="text-xl font-semibold text-gray-900">{totalSize}</p>
            </div>
          </div>
        </div>

        {/* Contexts List */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider px-1">
            Cached Contexts
          </h3>
          
          {contexts.length > 0 ? (
            contexts.map((context) => (
              <div
                key={context.id}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-200"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center">
                      <h4 className="text-sm font-medium text-gray-900">{context.name}</h4>
                      <div className="ml-2">
                        {getStatusBadge(context.status)}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 break-all">{context.url}</p>
                    <div className="flex items-center mt-2">
                      <p className="text-xs text-gray-500 mr-3">Size: {context.size}</p>
                      <p className="text-xs text-gray-500">Updated: {formatDate(context.lastUpdated)}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => handleRefreshContext(context.id)}
                      className="p-1.5 rounded-full text-blue-600 hover:bg-blue-100"
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button 
                      onClick={() => handleDeleteContext(context.id)}
                      className="p-1.5 rounded-full text-red-600 hover:bg-red-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl shadow-sm">
              <Database size={48} className="text-gray-300 mb-4" />
              <p className="text-gray-500 text-center">No cached contexts</p>
              <p className="text-gray-400 text-sm text-center mt-1">
                Contexts will be cached as you use the application
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}