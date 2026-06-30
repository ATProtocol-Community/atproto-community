export interface CommunityEvent {
  name: string;
  startsAt: Date;
  endsAt?: Date;
  description?: string;
  mode: 'inperson' | 'virtual' | 'hybrid';
  status: string;
  location?: string;
  locationDetail?: LocationDetail;
  /** Public-facing URL for this event (Smoke Signal / OpenMeet / etc.). */
  uri: string;
  /** at:// URI of the underlying event record. */
  atUri: string;
  source: string;
  rkey: string;
  did: string;
}

export interface LocationDetail {
  type: 'address' | 'geo' | 'hthree';
  name?: string;
  locality?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

export interface SharedPost {
  title: string;
  url: string;
  textContent?: string;
  publishedAt?: Date;
  sharedAt: Date;
  author: AtProfile;
  sharedBy?: AtProfile;
  source: string;
  documentUri: string;
  shareRecordUri: string;
  shareRecordRkey: string;
  tags?: string[];
}

export interface BlogPost {
  title: string;
  url: string;
  textContent?: string;
  publishedAt: Date;
  author: AtProfile;
  path?: string;
  tags?: string[];
  rkey: string;
  did: string;
}

export interface AtProfile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}
