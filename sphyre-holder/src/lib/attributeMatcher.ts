const ATTRIBUTE_SYNONYMS: Record<string, string[]> = {
  employee_status: [
    'employee_status',
    'employeestatus',
    'employment_status',
    'employmentstatus',
    'status',
    'work_status',
    'workstatus',
    'emp_status',
    'empstatus',
  ],
  
  org_affiliation: [
    'org_affiliation',
    'orgaffiliation',
    'organization',
    'org',
    'company',
    'employer',
    'organization_name',
    'org_name',
    'orgname',
    'affiliation',
  ],
  
  job_title: [
    'job_title',
    'jobtitle',
    'title',
    'position',
    'role',
    'job_position',
    'jobposition',
    'job_role',
    'jobrole',
    'occupation',
  ],
  
  full_name: [
    'full_name',
    'fullname',
    'name',
    'full name',
    'complete_name',
    'completename',
  ],
  
  first_name: [
    'first_name',
    'firstname',
    'given_name',
    'givenname',
    'first name',
  ],
  
  last_name: [
    'last_name',
    'lastname',
    'family_name',
    'familyname',
    'surname',
    'last name',
  ],
  
  id_number: [
    'id_number',
    'idnumber',
    'id',
    'identification_number',
    'identificationnumber',
    'national_id',
    'nationalid',
  ],
  
  date_of_birth: [
    'date_of_birth',
    'dateofbirth',
    'dob',
    'birth_date',
    'birthdate',
    'birthday',
  ],
  
  address: [
    'address',
    'full_address',
    'fulladdress',
    'residential_address',
    'residentialaddress',
    'location',
  ],
  
  nationality: [
    'nationality',
    'country',
    'citizenship',
    'national',
  ],
  
  age_over_21: [
    'age_over_21',
    'ageover21',
    'age',
    'age_verification',
    'ageverification',
    'over_21',
    'over21',
  ],
  
  degree: [
    'degree',
    'degree_name',
    'degreename',
    'qualification',
    'certificate',
  ],
  
  institution: [
    'institution',
    'school',
    'university',
    'college',
    'institution_name',
    'institutionname',
  ],
  
  graduation_year: [
    'graduation_year',
    'graduationyear',
    'year_graduated',
    'yeargraduated',
    'completion_year',
    'completionyear',
  ],
};

function normalizeAttributeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_-]/g, '')
    .trim();
}


function findSynonymGroup(attributeName: string): string | null {
  const normalized = normalizeAttributeName(attributeName);
  
  for (const [standardName, synonyms] of Object.entries(ATTRIBUTE_SYNONYMS)) {
    if (normalizeAttributeName(standardName) === normalized) {
      return standardName;
    }
    if (synonyms.some(syn => normalizeAttributeName(syn) === normalized)) {
      return standardName;
    }
  }
  
  return null;
}

export function attributesMatch(requested: string, available: string): boolean {
  const normalizedRequested = normalizeAttributeName(requested);
  const normalizedAvailable = normalizeAttributeName(available);

  if (normalizedRequested === normalizedAvailable) {
    return true;
  }

  const requestedGroup = findSynonymGroup(requested);
  const availableGroup = findSynonymGroup(available);
  
  if (requestedGroup && availableGroup && requestedGroup === availableGroup) {
    console.log(`Synonym match: "${requested}" and "${available}" both belong to group "${requestedGroup}"`);
    return true;
  }
 
  if (normalizedRequested.length >= 4 && normalizedAvailable.length >= 4) {
    if (normalizedRequested.includes(normalizedAvailable) || 
        normalizedAvailable.includes(normalizedRequested)) {
      const longer = normalizedRequested.length > normalizedAvailable.length 
        ? normalizedRequested : normalizedAvailable;
      const shorter = normalizedRequested.length <= normalizedAvailable.length 
        ? normalizedRequested : normalizedAvailable;
      
      // At least 60% similarity
      if (shorter.length / longer.length >= 0.6) {
        console.log(`Fuzzy match: "${requested}" and "${available}" (${Math.round(shorter.length / longer.length * 100)}% similarity)`);
        return true;
      }
    }
  }
  
  return false;
}

export interface MatchResult {
  canSatisfy: boolean;
  matchedAttributes: Array<{ requested: string; matched: string }>;
  missingAttributes: string[];
  matchScore: number;
}

export function checkCredentialMatch(
  requestedAttributeIds: string[],
  credentialAttributeIds: string[]
): MatchResult {
  const matched: Array<{ requested: string; matched: string }> = [];
  const missing: string[] = [];
  
  console.log('Starting match check:', {
    requested: requestedAttributeIds,
    available: credentialAttributeIds,
  });

  for (const requested of requestedAttributeIds) {
    let found = false;
    
    for (const available of credentialAttributeIds) {
      if (attributesMatch(requested, available)) {
        console.log(`Match found: "${requested}" → "${available}"`);
        matched.push({ requested, matched: available });
        found = true;
        break;
      }
    }
    
    if (!found) {
      console.log(`No match for: "${requested}" (tried against: [${credentialAttributeIds.join(', ')}])`);
      missing.push(requested);
    }
  }
  
  const matchScore = requestedAttributeIds.length > 0
    ? (matched.length / requestedAttributeIds.length) * 100
    : 100;
  
  const canSatisfy = missing.length === 0;
  
  console.log('Match result:', {
    canSatisfy,
    matchScore: `${matchScore.toFixed(1)}%`,
    matched: matched.length,
    missing: missing.length,
    missingList: missing,
  });
  
  return {
    canSatisfy,
    matchedAttributes: matched,
    missingAttributes: missing,
    matchScore,
  };
}

export function getMatchExplanation(result: MatchResult): string {
  if (result.canSatisfy) {
    return `Meets the request (${result.matchedAttributes.length} attributes matched)`;
  } else if (result.matchScore >= 50) {
    return `Partially matches (${result.matchedAttributes.length}/${result.matchedAttributes.length + result.missingAttributes.length} attributes)`;
  } else {
    return `Does not meet the request (${result.missingAttributes.length} attributes missing)`;
  }
}

export function addAttributeSynonym(standardName: string, synonyms: string[]): void {
  if (!ATTRIBUTE_SYNONYMS[standardName]) {
    ATTRIBUTE_SYNONYMS[standardName] = [standardName];
  }
  
  ATTRIBUTE_SYNONYMS[standardName].push(...synonyms);
}

export function getAttributeSynonyms(attributeName: string): string[] {
  const normalized = attributeName.toLowerCase();
  return ATTRIBUTE_SYNONYMS[normalized] || [attributeName];
}
