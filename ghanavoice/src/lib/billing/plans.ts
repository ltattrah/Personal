/**
 * Monetisation model. Citizen access stays free; revenue comes from
 * institutions. Numbers are placeholders for negotiation, not published
 * prices; the point is the structure and the entitlements it unlocks.
 */
export type PlanId = 'citizen' | 'institution' | 'organisation-assistant' | 'api';

export interface Plan {
  id: PlanId;
  name: string;
  audience: string;
  /** Indicative monthly price in GHS; null = free; 'quote' = negotiated */
  indicativePriceGhs: number | null | 'quote';
  entitlements: {
    monthlyQuestions: number | 'unlimited';
    apiAccess: boolean;
    /** Organisation can add its own curated content, visible only to its users */
    privateKnowledgeBase: boolean;
    customGlossary: boolean;
    branding: boolean;
    analyticsExport: boolean;
    slaSupport: boolean;
    offlinePacks: boolean;
  };
}

export const PLANS: Record<PlanId, Plan> = {
  citizen: {
    id: 'citizen',
    name: 'Citizen',
    audience: 'Individuals in Ghana',
    indicativePriceGhs: null,
    entitlements: { monthlyQuestions: 'unlimited', apiAccess: false, privateKnowledgeBase: false, customGlossary: false, branding: false, analyticsExport: false, slaSupport: false, offlinePacks: true },
  },
  institution: {
    id: 'institution',
    name: 'Institutional licence',
    audience: 'Ministries, agencies, district assemblies, NGOs, schools',
    indicativePriceGhs: 'quote',
    entitlements: { monthlyQuestions: 'unlimited', apiAccess: false, privateKnowledgeBase: false, customGlossary: true, branding: true, analyticsExport: true, slaSupport: true, offlinePacks: true },
  },
  'organisation-assistant': {
    id: 'organisation-assistant',
    name: 'Organisation-specific assistant',
    audience: 'Cooperatives, hospitals (admin info only), telcos, banks, universities',
    indicativePriceGhs: 'quote',
    entitlements: { monthlyQuestions: 'unlimited', apiAccess: true, privateKnowledgeBase: true, customGlossary: true, branding: true, analyticsExport: true, slaSupport: true, offlinePacks: true },
  },
  api: {
    id: 'api',
    name: 'API access',
    audience: 'Developers, radio stations, USSD/IVR integrators, research groups',
    indicativePriceGhs: 'quote',
    entitlements: { monthlyQuestions: 50_000, apiAccess: true, privateKnowledgeBase: false, customGlossary: false, branding: false, analyticsExport: true, slaSupport: false, offlinePacks: false },
  },
};
