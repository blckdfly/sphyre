import apiService from './apiService';

export type ActivityType =
  | 'credential_requested'
  | 'offer_received'
  | 'credential_issued'
  | 'credential_presented'
  | 'offer_rejected'
  | 'offer_accepted'
  | 'verification_completed'
  | 'credential_revoked'
  | 'access_requested';

export type ActivityStatus = 'pending' | 'completed' | 'failed' | 'rejected';

export interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: number;
  timestampFormatted: string;
  status: ActivityStatus;
  metadata?: Record<string, string>;
}

export interface ActivityLoadResult {
  activities: Activity[];
  fromCache: boolean;
  error?: string;
}

interface BackendActivity {
  id: string;
  holder_did: string;
  activity_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  sanitized_metadata?: Record<string, string>;
}

interface ActivityCacheEntry {
  activities: Activity[];
  syncedAt: number;
}

const CACHE_KEY_PREFIX = 'ssi_wallet_activities:';
const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
const MAX_ACTIVITIES = 100;

class ActivityService {
  private memoryCache = new Map<string, ActivityCacheEntry>();
  private issuerNameCache = new Map<string, string>();

  async loadActivities(
    did: string,
    options: { force?: boolean; limit?: number } = {}
  ): Promise<ActivityLoadResult> {
    if (!did) {
      return { activities: [], fromCache: true, error: 'Wallet DID is required' };
    }

    const cacheEntry = this.readCache(did);
    const cacheIsFresh = cacheEntry
      ? Date.now() - cacheEntry.syncedAt < CACHE_TTL_MS
      : false;

    if (cacheEntry && cacheIsFresh && !options.force) {
      return { activities: cacheEntry.activities, fromCache: true };
    }

    try {
      const response = await apiService.getWalletActivities(did, options.limit);

      if (!response.success || !response.data) {
        throw new Error(response.error || 'Failed to fetch wallet activities');
      }

      const payload = response.data as {
        success?: boolean;
        data?: BackendActivity[];
        error?: string;
      };

      if (payload.success === false) {
        throw new Error(payload.error || 'Failed to fetch wallet activities');
      }

      const backendActivities = Array.isArray(payload.data) ? payload.data : [];
      await this.enrichIssuerMetadata(backendActivities);
      const activities = this.transformAndSortActivities(backendActivities);

      this.writeCache(did, activities);

      return { activities, fromCache: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const fallback = this.readCache(did);
      if (fallback) {
        return {
          activities: fallback.activities,
          fromCache: true,
          error: message,
        };
      }

      return { activities: [], fromCache: true, error: message };
    }
  }

  getCachedActivities(did: string): Activity[] {
    const cache = this.readCache(did);
    return cache ? cache.activities : [];
  }

  clearCache(did?: string): void {
    if (did) {
      this.memoryCache.delete(did);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(this.getCacheKey(did));
      }
      return;
    }

    this.memoryCache.clear();
    if (typeof window !== 'undefined') {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(CACHE_KEY_PREFIX))
        .forEach((key) => localStorage.removeItem(key));
    }
  }

  formatTimestamp(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (days < 30) {
      const weeks = Math.floor(days / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }

    const date = new Date(timestamp);
    return date.toLocaleDateString();
  }

  getActivityWithFormattedTime(activity: Activity): Activity {
    return {
      ...activity,
      timestampFormatted: this.formatTimestamp(activity.timestamp),
    };
  }

  private transformAndSortActivities(backendActivities: BackendActivity[]): Activity[] {
    const converted = backendActivities
      .map((activity) => this.transformActivity(activity))
      .filter((activity): activity is Activity => activity !== null)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_ACTIVITIES);

    return converted;
  }

  private async enrichIssuerMetadata(backendActivities: BackendActivity[]): Promise<void> {
    const didsToResolve = new Set<string>();

    backendActivities.forEach((activity) => {
      const sanitized = activity.sanitized_metadata || {};
      const issuerName = sanitized.issuer_name || sanitized.issuerName;
      const issuerDid = sanitized.issuer_did || sanitized.issuerDid;

      if (issuerDid) {
        if (issuerName) {
          this.issuerNameCache.set(issuerDid, issuerName);
        } else if (!this.issuerNameCache.has(issuerDid)) {
          didsToResolve.add(issuerDid);
        }
      }
    });

    for (const issuerDid of didsToResolve) {
      try {
        const response = await apiService.getIssuerInfo(issuerDid);
        if (response.success && response.data) {
          const payload = response.data as Record<string, unknown>;
          const issuerData = (payload.issuer as Record<string, unknown>) ?? payload;
          const resolvedName = (issuerData?.name as string) ?? (issuerData?.organization as string) ?? null;
          if (resolvedName) {
            this.issuerNameCache.set(issuerDid, resolvedName);
            continue;
          }
        }
      } catch (error) {
        console.warn(`Failed to resolve issuer name for ${issuerDid}:`, error);
      }

      if (!this.issuerNameCache.has(issuerDid)) {
        this.issuerNameCache.set(issuerDid, 'Unknown Issuer');
      }
    }

    backendActivities.forEach((activity) => {
      const sanitized = activity.sanitized_metadata || {};
      const issuerDid = sanitized.issuer_did || sanitized.issuerDid;
      if (issuerDid && this.issuerNameCache.has(issuerDid)) {
        activity.sanitized_metadata = {
          ...sanitized,
          issuer_did: issuerDid,
          issuer_name: this.issuerNameCache.get(issuerDid) || 'Unknown Issuer',
        };
      }
    });
  }

  private transformActivity(activity: BackendActivity): Activity | null {
    const timestamp = new Date(activity.created_at).getTime();
    if (Number.isNaN(timestamp)) {
      return null;
    }

    const type = this.normalizeActivityType(activity.activity_type);
    const status = this.normalizeActivityStatus(activity.status);
    const sanitized = activity.sanitized_metadata || {};

    const { title, description, metadata } = this.extractPresentationFields(
      type,
      sanitized
    );

    return {
      id: activity.id,
      type,
      status,
      title,
      description,
      timestamp,
      timestampFormatted: this.formatTimestamp(timestamp),
      metadata,
    };
  }

  private extractPresentationFields(
    type: ActivityType,
    sanitized: Record<string, string>
  ): { title: string; description: string; metadata?: Record<string, string> } {
    const fallbackTitle = this.getDefaultTitle(type);
    const fallbackDescription = this.getDefaultDescription(type, sanitized);

    const title = sanitized.title || fallbackTitle;
    const description =
      sanitized.description || sanitized.summary || fallbackDescription;

    const metadataEntries = Object.entries(sanitized).filter(
      ([key]) => key !== 'title' && key !== 'description'
    );

    const metadata = metadataEntries.length
      ? Object.fromEntries(metadataEntries)
      : undefined;

    return { title, description, metadata };
  }

  private getDefaultTitle(type: ActivityType): string {
    switch (type) {
      case 'credential_requested':
        return 'Credential requested';
      case 'offer_received':
        return 'Credential offer received';
      case 'credential_issued':
        return 'Credential issued';
      case 'credential_presented':
        return 'Credential presented';
      case 'offer_rejected':
        return 'Offer rejected';
      case 'offer_accepted':
        return 'Offer accepted';
      case 'verification_completed':
        return 'Verification completed';
      case 'credential_revoked':
        return 'Credential revoked';
      case 'access_requested':
        return 'Access requested';
      default:
        return 'Wallet activity';
    }
  }

  private getDefaultDescription(
    type: ActivityType,
    sanitized: Record<string, string>
  ): string {
    const issuer = sanitized.issuer_name || sanitized.issuer_did;
    const verifier = sanitized.verifier_name || sanitized.verifier_did;
    const credential = sanitized.credential_type || 'credential';

    switch (type) {
      case 'credential_requested':
        return issuer
          ? `You requested ${credential} from ${issuer}. Waiting for their response.`
          : `You submitted a request for ${credential}.`;
      case 'offer_received':
        return issuer
          ? `Credential offer received from ${issuer}`
          : 'Credential offer received';
      case 'credential_issued':
        return issuer
          ? `${credential} issued by ${issuer}`
          : `${credential} issued`;
      case 'credential_presented':
        return verifier
          ? `Presented to ${verifier}`
          : 'Credential presentation completed';
      case 'offer_rejected':
        return issuer ? `Offer from ${issuer} rejected` : 'Offer rejected';
      case 'offer_accepted':
        return issuer ? `Offer from ${issuer} accepted` : 'Offer accepted';
      case 'verification_completed':
        return verifier
          ? `Your credential was verified successfully by ${verifier}.`
          : 'Your credential verification finished successfully.';
      case 'credential_revoked':
        return issuer
          ? `${credential} access revoked by ${issuer}.`
          : `${credential} access has been revoked.`;
      case 'access_requested':
        return verifier
          ? `${verifier} is requesting access again.`
          : 'A verifier is requesting access to your credential.';
      default:
        return 'Wallet activity recorded';
    }
  }

  private normalizeActivityType(type: string): ActivityType {
    const normalized = type.toLowerCase() as ActivityType;
    if (
      [
        'credential_requested',
        'offer_received',
        'credential_issued',
        'credential_presented',
        'offer_rejected',
        'offer_accepted',
        'verification_completed',
        'credential_revoked',
        'access_requested',
      ].includes(normalized)
    ) {
      return normalized;
    }
    return 'credential_requested';
  }

  private normalizeActivityStatus(status: string): ActivityStatus {
    const normalized = status.toLowerCase() as ActivityStatus;
    if (['pending', 'completed', 'failed', 'rejected'].includes(normalized)) {
      return normalized;
    }
    return 'pending';
  }

  private writeCache(did: string, activities: Activity[]): void {
    const entry: ActivityCacheEntry = {
      activities,
      syncedAt: Date.now(),
    };

    this.memoryCache.set(did, entry);

    if (typeof window !== 'undefined') {
      localStorage.setItem(this.getCacheKey(did), JSON.stringify(entry));
    }
  }

  private readCache(did: string): ActivityCacheEntry | null {
    if (this.memoryCache.has(did)) {
      return this.memoryCache.get(did) ?? null;
    }

    if (typeof window === 'undefined') {
      return null;
    }

    const raw = localStorage.getItem(this.getCacheKey(did));
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as ActivityCacheEntry;
      if (!parsed || !Array.isArray(parsed.activities)) {
        return null;
      }

      const normalizedActivities = parsed.activities.map((activity) => ({
        ...activity,
        timestampFormatted: this.formatTimestamp(activity.timestamp),
      }));

      const entry: ActivityCacheEntry = {
        activities: normalizedActivities,
        syncedAt: parsed.syncedAt || 0,
      };

      this.memoryCache.set(did, entry);
      return entry;
    } catch (error) {
      console.warn('Failed to parse cached activities, clearing cache', error);
      localStorage.removeItem(this.getCacheKey(did));
      return null;
    }
  }

  private getCacheKey(did: string): string {
    return `${CACHE_KEY_PREFIX}${did}`;
  }
}

const activityService = new ActivityService();
export default activityService;

