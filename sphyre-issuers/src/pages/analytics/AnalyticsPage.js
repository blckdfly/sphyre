import React from 'react';
import Layout from '../../components/layout/Layout';
import { 
  ChartBarIcon, 
  DocumentTextIcon, 
  ShieldCheckIcon, 
  UsersIcon, 
  ClockIcon, 
  CheckCircleIcon, 
  XCircleIcon 
} from '@heroicons/react/outline';

const AnalyticsPage = () => {
  return (
    <Layout title="Analytics Dashboard">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-2 sm:space-y-0">
          <h2 className="text-lg font-medium text-gray-900">Analytics Dashboard</h2>
          <div className="flex space-x-3">
            <select
              id="timeRange"
              name="timeRange"
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
            >
              <option>Last 7 days</option>
              <option>Last 30 days</option>
              <option>Last 90 days</option>
              <option>Last year</option>
              <option>All time</option>
            </select>
            <button
              type="button"
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Export Report
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-indigo-100 rounded-md p-3">
                  <DocumentTextIcon className="h-6 w-6 text-indigo-600" aria-hidden="true" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Credentials</dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">71,897</div>
                      <div className="text-sm text-green-600">+5.4% from last period</div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-green-100 rounded-md p-3">
                  <ShieldCheckIcon className="h-6 w-6 text-green-600" aria-hidden="true" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Verifications</dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">58,219</div>
                      <div className="text-sm text-green-600">+12.3% from last period</div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-blue-100 rounded-md p-3">
                  <UsersIcon className="h-6 w-6 text-blue-600" aria-hidden="true" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Active Users</dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">24,363</div>
                      <div className="text-sm text-green-600">+3.2% from last period</div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0 bg-purple-100 rounded-md p-3">
                  <ChartBarIcon className="h-6 w-6 text-purple-600" aria-hidden="true" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Success Rate</dt>
                    <dd>
                      <div className="text-lg font-medium text-gray-900">98.5%</div>
                      <div className="text-sm text-green-600">+0.5% from last period</div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Credentials Issued Over Time */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium leading-6 text-gray-900">Credentials Issued Over Time</h3>
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  Trend of credentials issued over the selected time period.
                </p>
              </div>
              <div className="mt-5 h-64 bg-gray-50 rounded-md flex items-center justify-center">
                <p className="text-gray-400">Chart: Line chart showing credentials issued over time</p>
              </div>
            </div>
          </div>

          {/* Verification Status Distribution */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium leading-6 text-gray-900">Verification Status Distribution</h3>
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  Distribution of verification statuses.
                </p>
              </div>
              <div className="mt-5 h-64 bg-gray-50 rounded-md flex items-center justify-center">
                <p className="text-gray-400">Chart: Pie chart showing verification status distribution</p>
              </div>
            </div>
          </div>

          {/* Credential Types */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium leading-6 text-gray-900">Credential Types</h3>
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  Distribution of different credential types issued.
                </p>
              </div>
              <div className="mt-5 h-64 bg-gray-50 rounded-md flex items-center justify-center">
                <p className="text-gray-400">Chart: Bar chart showing credential types distribution</p>
              </div>
            </div>
          </div>

          {/* User Growth */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium leading-6 text-gray-900">User Growth</h3>
              <div className="mt-2">
                <p className="text-sm text-gray-500">
                  Growth of user base over time.
                </p>
              </div>
              <div className="mt-5 h-64 bg-gray-50 rounded-md flex items-center justify-center">
                <p className="text-gray-400">Chart: Line chart showing user growth over time</p>
              </div>
            </div>
          </div>
        </div>

        {/* Verification Performance */}
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900">Verification Performance</h3>
            <div className="mt-2">
              <p className="text-sm text-gray-500">
                Metrics related to verification performance.
              </p>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div className="bg-gray-50 overflow-hidden rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 bg-green-100 rounded-md p-3">
                      <CheckCircleIcon className="h-6 w-6 text-green-600" aria-hidden="true" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Approved</dt>
                        <dd>
                          <div className="text-lg font-medium text-gray-900">42,893</div>
                          <div className="text-sm text-green-600">+8.1% from last period</div>
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 overflow-hidden rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 bg-red-100 rounded-md p-3">
                      <XCircleIcon className="h-6 w-6 text-red-600" aria-hidden="true" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Rejected</dt>
                        <dd>
                          <div className="text-lg font-medium text-gray-900">2,317</div>
                          <div className="text-sm text-red-600">+1.2% from last period</div>
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 overflow-hidden rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 bg-yellow-100 rounded-md p-3">
                      <ClockIcon className="h-6 w-6 text-yellow-600" aria-hidden="true" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">Avg. Response Time</dt>
                        <dd>
                          <div className="text-lg font-medium text-gray-900">1.2 hours</div>
                          <div className="text-sm text-green-600">-15% from last period</div>
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AnalyticsPage;