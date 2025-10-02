import { ConsentScopeItem } from '@/lib/consent';

export type WalletCredential = {
  id: string;
  title: string;
  organization: string;
  bgColor: string;
  pattern: string;
  attributes: ConsentScopeItem[]; // attributes available inside this VC
};

export function listWalletCredentials(): WalletCredential[] {
  return [
    {
      id: 'lumera',
      title: 'Lumera Employee Badge',
      organization: 'Lumera Labs',
      bgColor: 'bg-gradient-to-br from-blue-600 to-blue-800',
      pattern: 'bg-blue-500/10',
      attributes: [
        { id: 'age_over_21', label: 'Age verification (over 21)' },
        { id: 'employee_status', label: 'Employment status' },
        { id: 'org_affiliation', label: 'Organizational affiliation' },
      ],
    },
    {
      id: 'neptune',
      title: 'NeptuneVisa Clearance VC',
      organization: 'Neptune Ltd.',
      bgColor: 'bg-gradient-to-br from-slate-700 to-slate-900',
      pattern: 'bg-slate-400/10',
      attributes: [
        { id: 'age_over_21', label: 'Verifikasi usia (lebih dari 21)' },
      ],
    },
    {
      id: 'nomadic',
      title: 'Nomadic Access Pass',
      organization: 'Nomadic',
      bgColor: 'bg-gradient-to-br from-slate-600 to-slate-800',
      pattern: 'bg-slate-400/10',
      attributes: [
        { id: 'org_affiliation', label: 'Afiliasi organisasi' },
      ],
    },
  ];
}
