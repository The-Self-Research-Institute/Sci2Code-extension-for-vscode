export interface CitationItem {
  key: string;
  title: string;
  creators: Array<{ firstName: string; lastName: string; creatorType: string }>;
  date: string;
  doi?: string;
  url?: string;
  itemType: string;
  abstractNote?: string;
  publicationTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  tags?: Array<{ tag: string }>;
}

export interface Sci2CodeAPI {
  getZoteroLibrary(): Promise<any[]>;
  getZoteroItem(key: string): Promise<any | null>;
  formatCitationForOntology(key: string, format?: 'turtle' | 'rdfxml'): Promise<string>;
  getCitationMetadata(key: string): Promise<CitationItem | null>;
  isAuthenticated(): Promise<boolean>;
}