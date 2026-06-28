import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { issuerApi } from '../../services/api';
import { 
  DocumentTextIcon, 
  ShieldCheckIcon, 
  ChartBarIcon,
  TrendingUpIcon,
  ClockIcon
} from '@heroicons/react/outline';

const DashboardPage = () => {
  const [stats, setStats] = useState([
    { name: 'Total Credentials', stat: '0', icon: DocumentTextIcon, trend: '+0%' },
    { name: 'Pending Requests', stat: '0', icon: ShieldCheckIcon, trend: '+0%' },
    { name: 'Issued Today', stat: '0', icon: ChartBarIcon, trend: '+0%' },
  ]);

  const [recentActivity, setRecentActivity] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [insights, setInsights] = useState({
    credentials: { active: 0, revoked: 0, expired: 0 },
    offers: { pending: 0, completed: 0, expired: 0 },
    requests: { approved: 0, pending: 0, rejected: 0 },
  });

  const getTimeAgo = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return `${seconds} seconds ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };

  const truncateDID = (did) => {
    if (!did) return 'Unknown';
    if (did.length <= 30) return did;
    return `${did.slice(0, 15)}...${did.slice(-10)}`;
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    try {
      const issuerInfo = JSON.parse(localStorage.getItem('issuerInfo') || '{}');
      const token = issuerInfo.token || localStorage.getItem('token') || localStorage.getItem('issuer_token');
      const issuerDid = localStorage.getItem('issuerDID') || issuerInfo.did || issuerInfo.id;

      if (!token || !issuerDid) {
        console.error('No issuer credentials found');
        setIsLoading(false);
        return;
      }

      const [credentialsResponse, offersResponse, requestsResponse] = await Promise.all([
        issuerApi.listIssuedCredentials(token, issuerDid).catch(() => ({ data: [] })),
        issuerApi.listOffers(token, issuerDid).catch(() => ({ data: [] })),
        issuerApi.getCredentialRequests(token, issuerDid).catch(() => ({ data: [] }))
      ]);

      const credentials = Array.isArray(credentialsResponse) ? credentialsResponse : (credentialsResponse?.data || credentialsResponse?.credentials || []);
      const offers = Array.isArray(offersResponse) ? offersResponse : (offersResponse?.data || offersResponse?.offers || []);
      const requests = Array.isArray(requestsResponse) ? requestsResponse : (requestsResponse?.data || requestsResponse?.requests || []);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const issuedToday = credentials.filter(c => {
        const issueDate = new Date(c.issuance_date || c.created_at);
        return issueDate >= today;
      }).length;

      const pendingRequests = requests.filter(r => r.status === 'pending').length;
      const pendingOffers = offers.filter((offer) => (offer.status || '').toLowerCase() === 'pending' && !offer.one_time_used).length;

      setStats([
        { name: 'Total Credentials', stat: credentials.length.toString(), icon: DocumentTextIcon, trend: issuedToday > 0 ? `+${issuedToday} today` : `${credentials.length} total` },
        { name: 'Pending Verification Requests', stat: pendingRequests.toString(), icon: ShieldCheckIcon, trend: requests.length > 0 ? `${requests.length} total` : '0' },
        { name: 'Open Credential Offers', stat: pendingOffers.toString(), icon: TrendingUpIcon, trend: `${offers.length} total` },
      ]);

      const credentialActive = credentials.filter((cred) => (cred.status || '').toLowerCase() === 'active').length;
      const credentialRevoked = credentials.filter((cred) => (cred.status || '').toLowerCase() === 'revoked').length;
      const credentialExpired = credentials.filter((cred) => (cred.status || '').toLowerCase() === 'expired').length;

      const offerCompleted = offers.filter((offer) => (offer.status || '').toLowerCase() === 'completed').length;
      const offerExpired = offers.filter((offer) => (offer.status || '').toLowerCase() === 'expired').length;

      const requestApproved = requests.filter((req) => (req.status || '').toLowerCase() === 'approved').length;
      const requestRejected = requests.filter((req) => (req.status || '').toLowerCase() === 'rejected').length;

      setInsights({
        credentials: {
          active: credentialActive,
          revoked: credentialRevoked,
          expired: credentialExpired,
        },
        offers: {
          pending: pendingOffers,
          completed: offerCompleted,
          expired: offerExpired,
        },
        requests: {
          approved: requestApproved,
          pending: pendingRequests,
          rejected: requestRejected,
        },
      });

      const activities = [];

      credentials
        .slice()
        .sort((a, b) => new Date(b.created_at || b.issuance_date || 0) - new Date(a.created_at || a.issuance_date || 0))
        .slice(0, 5)
        .forEach(cred => {
        activities.push({
          id: `cred-${cred.id}`,
          user: truncateDID(cred.subject_did || cred.owner_did),
          action: 'Credential Issued',
          credential: cred.credential_type || 'Credential',
          time: getTimeAgo(cred.issuance_date || cred.created_at),
          type: 'issue',
          timestamp: new Date(cred.issuance_date || cred.created_at || Date.now()).getTime(),
        });
      });

      requests
        .filter(r => r.status === 'pending')
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .slice(0, 5)
        .forEach(req => {
        activities.push({
          id: `req-${req.id}`,
          user: truncateDID(req.user_did),
          action: 'Verification Request',
          credential: req.credential_type || req.schema_id || 'Credential',
          time: getTimeAgo(req.created_at),
          type: 'verify',
          timestamp: new Date(req.created_at || Date.now()).getTime(),
        });
      });

      offers
        .filter((offer) => (offer.status || '').toLowerCase() === 'pending' && !offer.one_time_used)
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .slice(0, 5)
        .forEach((offer) => {
          activities.push({
            id: `offer-${offer.id}`,
            user: truncateDID(offer.accepted_by_did || 'Awaiting holder'),
            action: 'Credential Offer Active',
            credential: offer.credential_type || offer.schema_id || 'Offer',
            time: getTimeAgo(offer.created_at),
            type: 'offer',
            timestamp: new Date(offer.created_at || Date.now()).getTime(),
          });
        });

      activities.sort((a, b) => {
        return (b.timestamp || 0) - (a.timestamp || 0);
      });

      setRecentActivity(activities.slice(0, 10));
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getActionColor = (type) => {
    switch (type) {
      case 'issue': return '#0005FF';
      case 'verify': return '#8B8B9E';
      case 'revoke': return '#EF4444';
      case 'complete': return '#10B981';
      default: return '#8B8B9E';
    }
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
    },
    header: {
      marginBottom: '8px',
    },
    title: {
      fontSize: '28px',
      fontWeight: '700',
      color: '#FFFFFF',
      marginBottom: '8px',
      letterSpacing: '-0.02em',
    },
    subtitle: {
      fontSize: '14px',
      color: '#8B8B9E',
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: '16px',
    },
    statCard: {
      background: '#0F0F0F',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '16px',
      padding: '24px',
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      cursor: 'pointer',
    },
    statCardHover: {
      borderColor: 'rgba(0, 5, 255, 0.3)',
      transform: 'translateY(-2px)',
    },
    statHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '16px',
    },
    statIcon: {
      width: '40px',
      height: '40px',
      borderRadius: '12px',
      background: 'rgba(0, 5, 255, 0.1)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statTrend: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 8px',
      borderRadius: '6px',
      background: 'rgba(16, 185, 129, 0.1)',
      fontSize: '12px',
      fontWeight: '600',
      color: '#10B981',
    },
    statValue: {
      fontSize: '32px',
      fontWeight: '700',
      color: '#FFFFFF',
      marginBottom: '4px',
      letterSpacing: '-0.02em',
    },
    statLabel: {
      fontSize: '14px',
      color: '#8B8B9E',
    },
    activitySection: {
      background: '#0F0F0F',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '16px',
      padding: '24px',
    },
    sectionTitle: {
      fontSize: '18px',
      fontWeight: '700',
      color: '#FFFFFF',
      marginBottom: '20px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    activityList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
    activityItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '16px',
      background: 'rgba(255, 255, 255, 0.02)',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      borderRadius: '12px',
      transition: 'all 0.2s ease',
    },
    activityItemHover: {
      background: 'rgba(255, 255, 255, 0.05)',
      borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    activityDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      flexShrink: 0,
    },
    activityContent: {
      flex: 1,
      minWidth: 0,
    },
    activityUser: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#FFFFFF',
      marginBottom: '4px',
    },
    activityAction: {
      fontSize: '13px',
      color: '#8B8B9E',
    },
    activityCredential: {
      color: '#0005FF',
      fontWeight: '500',
    },
    activityTime: {
      fontSize: '12px',
      color: '#52525E',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      flexShrink: 0,
    },
    emptyState: {
      textAlign: 'center',
      padding: '48px 24px',
      color: '#8B8B9E',
    },
  };

  const renderBreakdownCard = (title, segments, total) => (
    <div className="bg-dark-800 border border-dark-700/80 rounded-xl shadow-lg shadow-black/10 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-light-200 uppercase tracking-wide">{title}</h3>
        <span className="text-xs text-light-400">Total {total}</span>
      </div>
      <div className="space-y-3">
        {segments.map(({ label, value, color }) => {
          const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-light-300">
                <span>{label}</span>
                <span>{value} ({percentage}%)</span>
              </div>
              <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                <div
                  className={`${color} h-full transition-all duration-500`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Layout title="Dashboard">
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <div style={{ textAlign: 'center', color: '#8B8B9E' }}>
            <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Loading dashboard...</div>
            <div style={{ fontSize: '14px' }}>Fetching your credentials and requests</div>
          </div>
        </div>
      ) : (
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <p style={styles.subtitle}>
            Welcome back! Here's what's happening with your credentials.
          </p>
        </div>

        {/* Stats Grid */}
        <div style={styles.statsGrid}>
          {stats.map((item) => (
            <div
              key={item.name}
              style={styles.statCard}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0, 5, 255, 0.3)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={styles.statHeader}>
                <div style={styles.statIcon}>
                  <item.icon style={{ width: '20px', height: '20px', color: '#0005FF' }} />
                </div>
                <div style={styles.statTrend}>
                  <TrendingUpIcon style={{ width: '12px', height: '12px' }} />
                  {item.trend}
                </div>
              </div>
              <div style={styles.statValue}>{item.stat}</div>
              <div style={styles.statLabel}>{item.name}</div>
            </div>
          ))}
        </div>

        {/* Breakdown Section */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {renderBreakdownCard(
            'Credential Status',
            [
              { label: 'Active', value: insights.credentials.active, color: 'bg-success-500/60' },
              { label: 'Revoked', value: insights.credentials.revoked, color: 'bg-error-500/60' },
              { label: 'Expired', value: insights.credentials.expired, color: 'bg-warning-500/60' },
            ],
            insights.credentials.active + insights.credentials.revoked + insights.credentials.expired || 0
          )}
          {renderBreakdownCard(
            'Offer Pipeline',
            [
              { label: 'Pending', value: insights.offers.pending, color: 'bg-primary-500/60' },
              { label: 'Completed', value: insights.offers.completed, color: 'bg-success-500/60' },
              { label: 'Expired', value: insights.offers.expired, color: 'bg-dark-500/60' },
            ],
            insights.offers.pending + insights.offers.completed + insights.offers.expired || 0
          )}
          {renderBreakdownCard(
            'Verification Outcomes',
            [
              { label: 'Approved', value: insights.requests.approved, color: 'bg-success-500/60' },
              { label: 'Pending', value: insights.requests.pending, color: 'bg-warning-500/60' },
              { label: 'Rejected', value: insights.requests.rejected, color: 'bg-error-500/60' },
            ],
            insights.requests.approved + insights.requests.pending + insights.requests.rejected || 0
          )}
        </div>

        {/* Recent Activity */}
        <div style={styles.activitySection}>
          <h2 style={styles.sectionTitle}>
            <ClockIcon style={{ width: '20px', height: '20px', color: '#0005FF' }} />
            Recent Activity
          </h2>
          
          <div style={styles.activityList}>
            {recentActivity.length === 0 ? (
              <div style={styles.emptyState}>
                <p>No recent activity</p>
              </div>
            ) : (
              recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  style={styles.activityItem}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                  }}
                >
                  <div style={{ ...styles.activityDot, background: getActionColor(activity.type) }} />
                  <div style={styles.activityContent}>
                    <div style={styles.activityUser}>{activity.user}</div>
                    <div style={styles.activityAction}>
                      {activity.action} • <span style={styles.activityCredential}>{activity.credential}</span>
                    </div>
                  </div>
                  <div style={styles.activityTime}>
                    <ClockIcon style={{ width: '12px', height: '12px' }} />
                    {activity.time}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}>
          <button style={{
            background: '#0005FF',
            color: '#FFFFFF',
            padding: '16px 24px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#0003CC'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#0005FF'}
          onClick={() => window.location.href = '/credentials'}
          >
            Issue Credential
          </button>
          
          <button style={{
            background: 'transparent',
            color: '#FFFFFF',
            padding: '16px 24px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          onClick={() => window.location.href = '/verification'}
          >
            View Verifications
          </button>
        </div>
      </div>
      )}
    </Layout>
  );
};

export default DashboardPage;
