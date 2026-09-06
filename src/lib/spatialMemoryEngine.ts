/**
 * Spatial Memory Engine for Cognify 2.0
 * Provides persistent, multi-user isolated physical object tracking,
 * spatial extraction from vision descriptions, location history,
 * and epistemically honest spatial queries across English, Arabic, and French.
 */

import { SpatialObjectRecord } from '../types';
import { db, cleanDataForFirestore } from './firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const STORAGE_PREFIX = 'cognify_spatial_memory_';

// In-memory per-user cache for rapid query responses
const userSpatialCache: Map<string, SpatialObjectRecord[]> = new Map();

/**
 * Object definitions and keyword dictionaries across EN, AR, and FR
 */
const OBJECT_DICTIONARY: {
  category: SpatialObjectRecord['category'];
  nameEn: string;
  nameAr: string;
  nameFr: string;
  keywords: string[];
}[] = [
  {
    category: 'remote',
    nameEn: 'TV Remote',
    nameAr: 'ريموت التلفزيون',
    nameFr: 'Télécommande',
    keywords: [
      'remote', 'tv remote', 'television remote', 'controller',
      'ريموت', 'ريموت التلفزيون', 'جهاز التحكم', 'الريموت',
      'télécommande', 'telecommande', 'manette'
    ],
  },
  {
    category: 'keys',
    nameEn: 'Keys',
    nameAr: 'المفاتيح',
    nameFr: 'Clés',
    keywords: [
      'keys', 'key', 'keychain', 'car keys', 'house keys',
      'مفاتيح', 'مفتاح', 'المفاتيح', 'سلسلة المفاتيح',
      'clés', 'cles', 'clefs', 'porte-clés', 'porte-cles'
    ],
  },
  {
    category: 'glasses',
    nameEn: 'Glasses',
    nameAr: 'النظارة',
    nameFr: 'Lunettes',
    keywords: [
      'glasses', 'eyeglasses', 'spectacles', 'sunglasses',
      'نظارة', 'النظارة', 'نظارات', 'النظارات',
      'lunettes', 'lunettes de vue', 'lunettes de soleil'
    ],
  },
  {
    category: 'medication',
    nameEn: 'Medication',
    nameAr: 'الدواء / الأقراص',
    nameFr: 'Médicament',
    keywords: [
      'medication', 'medicine', 'pills', 'pill bottle', 'capsules',
      'دواء', 'الدواء', 'علاج', 'أقراص', 'علبة دواء',
      'médicament', 'medicament', 'médicaments', 'pilules', 'comprimés', 'boîte de médicament'
    ],
  },
  {
    category: 'phone',
    nameEn: 'Smartphone',
    nameAr: 'الهاتف المحمول',
    nameFr: 'Téléphone',
    keywords: [
      'phone', 'smartphone', 'cellphone', 'mobile',
      'هاتف', 'الهاتف', 'موبايل', 'الموبايل', 'تليفون',
      'téléphone', 'telephone', 'smartphone', 'portable'
    ],
  },
  {
    category: 'cup',
    nameEn: 'Cup / Mug',
    nameAr: 'كوب / فنجان',
    nameFr: 'Tasse / Verre',
    keywords: [
      'cup', 'mug', 'glass', 'water bottle', 'bottle',
      'كوب', 'كوباية', 'مج', 'فنجان', 'زجاجة مياه',
      'tasse', 'verre', 'bouteille', 'gobelet'
    ],
  },
  {
    category: 'bag',
    nameEn: 'Bag / Wallet',
    nameAr: 'حقيبة / محفظة',
    nameFr: 'Sac / Portefeuille',
    keywords: [
      'bag', 'backpack', 'handbag', 'wallet', 'purse',
      'حقيبة', 'شنطة', 'محفظة', 'كيس',
      'sac', 'sac à dos', 'portefeuille', 'sacoche'
    ],
  },
  {
    category: 'document',
    nameEn: 'Document / Paper',
    nameAr: 'مستند / ورقة',
    nameFr: 'Document / Papier',
    keywords: [
      'document', 'paper', 'notebook', 'id card', 'passport',
      'مستند', 'ورقة', 'كشكول', 'دفتر', 'بطاقة', 'جواز سفر',
      'document', 'papier', 'cahier', 'carte', 'passeport'
    ],
  },
];

const SURFACE_DICTIONARY = [
  { surfaceEn: 'Coffee Table', surfaceAr: 'ترابيزة الصالة', surfaceFr: 'Table basse', keywords: ['coffee table', 'ترابيزة صالة', 'ترابيزة الصالة', 'table basse'] },
  { surfaceEn: 'Table', surfaceAr: 'الترابيزة / الطاولة', surfaceFr: 'Table', keywords: ['table', 'dining table', 'ترابيزة', 'طاولة', 'منضدة', 'table à manger', 'table'] },
  { surfaceEn: 'Desk', surfaceAr: 'المكتب', surfaceFr: 'Bureau', keywords: ['desk', 'workstation', 'مكتب', 'ترابيزة مكتب', 'bureau'] },
  { surfaceEn: 'Sofa', surfaceAr: 'الكنبة', surfaceFr: 'Canapé', keywords: ['sofa', 'couch', 'armchair', 'كنبة', 'أنتريه', 'صوفا', 'canapé', 'fauteuil'] },
  { surfaceEn: 'Kitchen Counter', surfaceAr: 'رخامة المطبخ', surfaceFr: 'Plan de travail', keywords: ['counter', 'countertop', 'kitchen counter', 'رخامة المطبخ', 'طاولة المطبخ', 'plan de travail', 'comptoir'] },
  { surfaceEn: 'Nightstand', surfaceAr: 'الكومودينو', surfaceFr: 'Table de chevet', keywords: ['nightstand', 'bedside table', 'كومودينو', 'table de chevet', 'chevet'] },
  { surfaceEn: 'Bed', surfaceAr: 'السرير', surfaceFr: 'Lit', keywords: ['bed', 'mattress', 'سرير', 'السرير', 'lit'] },
  { surfaceEn: 'Shelf', surfaceAr: 'الرف', surfaceFr: 'Étagère', keywords: ['shelf', 'bookshelf', 'رف', 'الرف', 'مكتبة حائط', 'étagère', 'etagere'] },
  { surfaceEn: 'Floor', surfaceAr: 'الأرضية', surfaceFr: 'Sol', keywords: ['floor', 'ground', 'carpet', 'أرض', 'أرضية', 'سجادة', 'sol', 'tapis'] },
];

const ROOM_DICTIONARY = [
  { roomEn: 'Living Room', roomAr: 'الصالة / غرفة المعيشة', roomFr: 'Salon', keywords: ['living room', 'lounge', 'sitting room', 'صالة', 'غرفة المعيشة', 'صالون', 'salon', 'salle de séjour'] },
  { roomEn: 'Bedroom', roomAr: 'غرفة النوم', roomFr: 'Chambre', keywords: ['bedroom', 'غرفة النوم', 'أوضة النوم', 'chambre', 'chambre à coucher'] },
  { roomEn: 'Kitchen', roomAr: 'المطبخ', roomFr: 'Cuisine', keywords: ['kitchen', 'مطبخ', 'المطبخ', 'cuisine'] },
  { roomEn: 'Office', roomAr: 'غرفة المكتب', roomFr: 'Bureau', keywords: ['office', 'study room', 'غرفة المكتب', 'مكتب عمل', 'bureau'] },
  { roomEn: 'Hallway', roomAr: 'المدخل / الممر', roomFr: 'Couloir / Entrée', keywords: ['hallway', 'corridor', 'entrance', 'ممر', 'مدخل', 'طرقة', 'couloir', 'entrée', 'entree'] },
];

/**
 * Parses relative direction from text description
 */
function extractDirection(text: string): SpatialObjectRecord['relativePosition'] | undefined {
  const lower = text.toLowerCase();
  let direction: 'left' | 'right' | 'center' | 'top' | 'bottom' | undefined;
  let clockPosition: string | undefined;

  // Check clock positions e.g., "at 2 o'clock", "الساعة 2", "à 2 heures"
  const clockMatch = lower.match(/(?:at|clock position|الساعة|à)\s*(\d{1,2})\s*(?:o'?clock|heures)?/i);
  if (clockMatch && clockMatch[1]) {
    const hr = parseInt(clockMatch[1], 10);
    if (hr >= 1 && hr <= 12) {
      clockPosition = `at ${hr} o'clock`;
    }
  }

  if (lower.includes('left') || lower.includes('شمال') || lower.includes('يسار') || lower.includes('à gauche')) {
    direction = 'left';
  } else if (lower.includes('right') || lower.includes('يمين') || lower.includes('à droite')) {
    direction = 'right';
  } else if (lower.includes('center') || lower.includes('middle') || lower.includes('وسط') || lower.includes('في النص') || lower.includes('au centre') || lower.includes('milieu')) {
    direction = 'center';
  }

  let distance: 'near' | 'medium' | 'far' | undefined;
  if (lower.includes('close') || lower.includes('near') || lower.includes('قريب') || lower.includes('près') || lower.includes('proche')) {
    distance = 'near';
  } else if (lower.includes('far') || lower.includes('distant') || lower.includes('بعيد') || lower.includes('loin')) {
    distance = 'far';
  }

  if (direction || clockPosition || distance) {
    return { direction, clockPosition, distance };
  }
  return undefined;
}

/**
 * Extracts spatial objects, surfaces, and rooms from a vision AI scene description.
 */
export function extractSpatialObjectsFromVision(
  description: string,
  uid: string,
  lang: 'en' | 'ar' | 'fr' = 'en'
): SpatialObjectRecord[] {
  if (!description || !uid) return [];
  const lower = description.toLowerCase();
  const detected: SpatialObjectRecord[] = [];
  const now = Date.now();

  // Detect surfaces in the description
  let detectedSurface: (typeof SURFACE_DICTIONARY)[0] | undefined;
  for (const s of SURFACE_DICTIONARY) {
    if (s.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      detectedSurface = s;
      break;
    }
  }

  // Detect rooms in the description
  let detectedRoom: (typeof ROOM_DICTIONARY)[0] | undefined;
  for (const r of ROOM_DICTIONARY) {
    if (r.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      detectedRoom = r;
      break;
    }
  }

  const relativePos = extractDirection(description);

  // Match recognized objects
  for (const objDef of OBJECT_DICTIONARY) {
    const matchedKw = objDef.keywords.find((kw) => lower.includes(kw.toLowerCase()));
    if (matchedKw) {
      const surfaceName =
        lang === 'ar'
          ? detectedSurface?.surfaceAr
          : lang === 'fr'
          ? detectedSurface?.surfaceFr
          : detectedSurface?.surfaceEn;

      const roomName =
        lang === 'ar'
          ? detectedRoom?.roomAr
          : lang === 'fr'
          ? detectedRoom?.roomFr
          : detectedRoom?.roomEn;

      const objName =
        lang === 'ar' ? objDef.nameAr : lang === 'fr' ? objDef.nameFr : objDef.nameEn;

      detected.push({
        id: `sp_${objDef.category}_${uid.substring(0, 6)}`,
        uid,
        objectName: objName,
        category: objDef.category,
        surface: surfaceName || (lang === 'ar' ? 'الترابيزة' : lang === 'fr' ? 'Table' : 'Table'),
        room: roomName,
        relativePosition: relativePos,
        lastSeenTimestamp: now,
        lastSeenIso: new Date(now).toISOString(),
        confidence: 0.9,
        source: 'camera_auto',
        descriptionSnippet: description.slice(0, 160),
        history: [],
      });
    }
  }

  return detected;
}

/**
 * Retrieves all spatial objects stored for a specific user ID.
 * Strictly enforces user isolation.
 */
export function getSpatialObjects(uid: string): SpatialObjectRecord[] {
  if (!uid) return [];

  // Check in-memory cache
  if (userSpatialCache.has(uid)) {
    return userSpatialCache.get(uid)!;
  }

  // Check localStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${uid}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Double-check UID match to prevent cross-account leak
          const isolated = parsed.filter((rec: SpatialObjectRecord) => rec.uid === uid);
          userSpatialCache.set(uid, isolated);
          return isolated;
        }
      }
    } catch {
      // ignore
    }
  }

  return [];
}

/**
 * Saves or updates a spatial object record for a specific user.
 * Automatically records location history when an object moves.
 */
export async function saveSpatialObject(uid: string, record: SpatialObjectRecord): Promise<void> {
  if (!uid || !record) return;
  record.uid = uid; // guarantee user ownership

  const current = getSpatialObjects(uid);
  const existingIdx = current.findIndex(
    (item) => item.category === record.category || item.objectName.toLowerCase() === record.objectName.toLowerCase()
  );

  let updated: SpatialObjectRecord[];

  if (existingIdx >= 0) {
    const prev = current[existingIdx];
    const locationChanged =
      (record.surface && record.surface !== prev.surface) ||
      (record.room && record.room !== prev.room) ||
      (record.relativePosition?.direction && record.relativePosition.direction !== prev.relativePosition?.direction);

    const history = [...(prev.history || [])];
    if (locationChanged && prev.surface) {
      history.push({
        timestamp: prev.lastSeenTimestamp,
        room: prev.room,
        surface: prev.surface,
        direction: prev.relativePosition?.direction,
      });
      // Cap history to last 10 observations
      if (history.length > 10) history.shift();
    }

    const merged: SpatialObjectRecord = {
      ...prev,
      ...record,
      id: prev.id,
      history,
    };
    updated = [...current];
    updated[existingIdx] = merged;
  } else {
    updated = [record, ...current];
  }

  // Update memory cache
  userSpatialCache.set(uid, updated);

  // Persist locally
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${uid}`, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  // Persist to Firestore under user document (if online)
  try {
    if (typeof window !== 'undefined' && db) {
      const userRef = doc(db, `users/${uid}`);
      await setDoc(
        userRef,
        { spatialMemories: cleanDataForFirestore(updated) },
        { merge: true }
      );
    }
  } catch (err) {
    // Non-blocking offline support
  }
}

/**
 * Batch processes newly extracted spatial objects from camera observation.
 */
export async function recordObservedSpatialObjects(uid: string, records: SpatialObjectRecord[]): Promise<void> {
  if (!uid || !Array.isArray(records) || records.length === 0) return;
  for (const rec of records) {
    await saveSpatialObject(uid, rec);
  }
}

/**
 * Formats time elapsed into human readable string in EN, AR, or FR
 */
function formatTimeElapsed(timestamp: number, lang: 'en' | 'ar' | 'fr' = 'en'): string {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(mins / 60);

  if (lang === 'ar') {
    if (mins < 2) return 'منذ لحظات قليلة';
    if (mins < 60) return `منذ ${mins} دقيقة`;
    if (hours === 1) return 'منذ ساعة واحدة';
    if (hours === 2) return 'منذ ساعتين';
    if (hours <= 10) return `منذ ${hours} ساعات`;
    return `منذ ${hours} ساعة`;
  }

  if (lang === 'fr') {
    if (mins < 2) return "à l'instant";
    if (mins < 60) return `il y a ${mins} minute${mins > 1 ? 's' : ''}`;
    if (hours === 1) return 'il y a 1 heure';
    return `il y a ${hours} heures`;
  }

  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

/**
 * Epistemically honest spatial query resolver.
 * Answers "Where is my [item]?", "فين الـ [...]؟", "Où est [l'objet] ?"
 */
export function querySpatialMemory(
  uid: string,
  queryText: string,
  lang: 'en' | 'ar' | 'fr' = 'en'
): { found: boolean; message: string; record?: SpatialObjectRecord } {
  if (!uid || !queryText) {
    return {
      found: false,
      message:
        lang === 'ar'
          ? 'يرجى تحديد الشيء الذي تبحث عنه.'
          : lang === 'fr'
          ? "Veuillez préciser l'objet que vous recherchez."
          : 'Please specify the object you are searching for.',
    };
  }

  const lower = queryText.toLowerCase().trim();
  const objects = getSpatialObjects(uid);

  // Match target object by name or dictionary keywords
  let matchedRecord: SpatialObjectRecord | undefined;

  for (const rec of objects) {
    if (lower.includes(rec.objectName.toLowerCase())) {
      matchedRecord = rec;
      break;
    }
  }

  if (!matchedRecord) {
    for (const objDef of OBJECT_DICTIONARY) {
      if (objDef.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
        matchedRecord = objects.find((o) => o.category === objDef.category);
        if (matchedRecord) break;
      }
    }
  }

  if (!matchedRecord) {
    return {
      found: false,
      message:
        lang === 'ar'
          ? 'لم يتم رصد هذا الشيء بالكاميرا مؤخراً في ذاكرتك المكانية.'
          : lang === 'fr'
          ? "Cet objet n'a pas été observé récemment par la caméra dans votre mémoire spatiale."
          : "I haven't observed this object recently through the camera in your spatial memory.",
    };
  }

  const elapsed = formatTimeElapsed(matchedRecord.lastSeenTimestamp, lang);
  const pos = matchedRecord.relativePosition;
  let locDesc = '';

  if (lang === 'ar') {
    locDesc = `آخر مرة رأيت فيها "${matchedRecord.objectName}" كانت على ${matchedRecord.surface || 'الترابيزة'}`;
    if (matchedRecord.room) locDesc += ` في ${matchedRecord.room}`;
    if (pos?.direction === 'left') locDesc += ' (ناحية اليسار)';
    if (pos?.direction === 'right') locDesc += ' (ناحية اليمين)';
    if (pos?.clockPosition) locDesc += ` (${pos.clockPosition})`;
    locDesc += `، وذلك ${elapsed}.`;

    // Epistemic honesty qualifier if seen more than 20 minutes ago
    if (Date.now() - matchedRecord.lastSeenTimestamp > 20 * 60 * 1000) {
      locDesc += ' ملاحظة: نظراً لمرور بعض الوقت، قد يكون أحد قام بتحريكه.';
    }
  } else if (lang === 'fr') {
    locDesc = `La dernière fois que j'ai vu "${matchedRecord.objectName}", c'était sur ${matchedRecord.surface || 'la table'}`;
    if (matchedRecord.room) locDesc += ` dans ${matchedRecord.room}`;
    if (pos?.direction === 'left') locDesc += ' (sur la gauche)';
    if (pos?.direction === 'right') locDesc += ' (sur la droite)';
    locDesc += `, ${elapsed}.`;

    if (Date.now() - matchedRecord.lastSeenTimestamp > 20 * 60 * 1000) {
      locDesc += " Remarque : Du temps s'étant écoulé, il est possible qu'il ait été déplacé.";
    }
  } else {
    locDesc = `The last time I saw the "${matchedRecord.objectName}" was on the ${matchedRecord.surface || 'table'}`;
    if (matchedRecord.room) locDesc += ` in the ${matchedRecord.room}`;
    if (pos?.direction === 'left') locDesc += ' (on the left side)';
    if (pos?.direction === 'right') locDesc += ' (on the right side)';
    locDesc += `, ${elapsed}.`;

    if (Date.now() - matchedRecord.lastSeenTimestamp > 20 * 60 * 1000) {
      locDesc += ' Note: Since some time has passed, it might have been moved.';
    }
  }

  return {
    found: true,
    message: locDesc,
    record: matchedRecord,
  };
}

/**
 * Formats a clean context block of remembered object locations for the AI persona.
 */
export function formatSpatialMemoryForAI(uid: string, lang: 'en' | 'ar' | 'fr' = 'en'): string {
  const records = getSpatialObjects(uid);
  if (!records || records.length === 0) return '';

  let block = '\n## COGNIFY SPATIAL MEMORY (PHYSICAL OBJECT LOCATIONS REMEMBERED BY VISION COMPANION)\n';
  block += '- The following physical items have been observed for this student:\n';

  for (const r of records.slice(0, 10)) {
    const elapsed = formatTimeElapsed(r.lastSeenTimestamp, lang);
    const pos = r.relativePosition?.direction ? ` (${r.relativePosition.direction})` : '';
    block += `  * ${r.objectName}: on ${r.surface || 'surface'}${pos}${r.room ? ` in ${r.room}` : ''} [Seen ${elapsed}]\n`;
  }

  block += '- INSTRUCTION: If the user asks where an object is located, reference these last-known positions accurately and state when it was observed.\n';
  return block;
}
