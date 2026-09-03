/**
 * Mobile Contacts & WhatsApp Assistive Service for Quadriplegia / Motor Accessibility.
 */

export interface EmergencyContact {
  id: string;
  nameEn: string;
  nameAr: string;
  phone: string;
  relationship: 'family' | 'doctor' | 'caregiver' | 'friend' | 'emergency';
  avatar: string;
  isPrimaryEmergency?: boolean;
}

const STORAGE_KEY = 'cognify_saved_contacts';

/**
 * IMPORTANT: caregiver/family/doctor numbers below are intentionally EMPTY,
 * not filled with example numbers.
 *
 * This used to ship with realistic-looking placeholder numbers
 * (+201000000001 etc.). Nothing in the UI ever let a caregiver replace them
 * (no edit form existed at all — see the new "Manage contacts" modal in
 * MotorEuphoniaView.tsx), so a student relying on hands-free SOS dialing
 * (via a vocal trigger, gaze+blink, or voice) would have the app confidently
 * announce "Calling emergency [caregiver]" and silently dial a fake number
 * that reaches no one — in an actual emergency. An empty number is honest:
 * the "not set up" badge (see isValidContactPhone) makes the gap visible
 * instead of hiding it behind a number that merely looks real.
 * '123' (Egypt's real ambulance/emergency line) is kept as-is — it needs no
 * per-user setup and is genuinely correct out of the box.
 */
export const DEFAULT_CONTACTS: EmergencyContact[] = [
  {
    id: 'c-caregiver',
    nameEn: 'Caregiver / Supervisor',
    nameAr: 'المرافق / المشرف',
    phone: '',
    relationship: 'caregiver',
    avatar: '👨‍⚕️',
    isPrimaryEmergency: true,
  },
  {
    id: 'c-mother',
    nameEn: 'Mother / Family',
    nameAr: 'ماما / العائلة',
    phone: '',
    relationship: 'family',
    avatar: '👩‍🦰',
  },
  {
    id: 'c-doctor',
    nameEn: 'Specialist Doctor',
    nameAr: 'الدكتور المعالج',
    phone: '',
    relationship: 'doctor',
    avatar: '🩺',
  },
  {
    id: 'c-emergency',
    nameEn: 'Ambulance / Emergency',
    nameAr: 'الإسعاف / الطوارئ',
    phone: '123',
    relationship: 'emergency',
    avatar: '🚑',
  },
];

export function loadContacts(): EmergencyContact[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* fallback */
  }
  return DEFAULT_CONTACTS;
}

export function saveContacts(contacts: EmergencyContact[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
  } catch {
    /* ignore */
  }
}

/** A contact is actually callable — not empty, not obviously too short to be a real number. */
export function isValidContactPhone(phone: string | undefined | null): boolean {
  if (!phone) return false;
  const digits = phone.replace(/[^0-9]/g, '');
  return digits.length >= 3; // '123' (ambulance) is the shortest legitimate case
}

/** Trigger phone dialer. Returns false (and dials nothing) if the number isn't set up. */
export function makePhoneCall(phone: string): boolean {
  if (!isValidContactPhone(phone)) return false;
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  if (!cleanPhone) return false;
  window.open(`tel:${cleanPhone}`, '_self');
  return true;
}

/** Open WhatsApp chat with pre-filled message */
export function sendWhatsAppMessage(phone: string, text: string): void {
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const encodedText = encodeURIComponent(text);
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedText}`
    : `https://wa.me/?text=${encodedText}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Pre-set WhatsApp Assistive Quick Messages */
export const WHATSAPP_QUICK_MESSAGES = [
  {
    id: 'wa-help',
    textEn: 'I need assistance please. Please come to my room.',
    textAr: 'أحتاج إلى مساعدة عاجلة من فضلك. لو سمحت تعال لغرفتي.',
  },
  {
    id: 'wa-callme',
    textEn: 'Please call me when you are available.',
    textAr: 'من فضلك اتصل بي هاتفياً عندما تتفرغ.',
  },
  {
    id: 'wa-fine',
    textEn: 'I am doing fine and currently studying.',
    textAr: 'أنا بخير والحمد لله وبدرس حالياً على كوجنيفاي.',
  },
  {
    id: 'wa-water',
    textEn: 'I would like a drink of water please.',
    textAr: 'أحتاج إلى شرب ماء لو سمحت.',
  },
  {
    id: 'wa-emergency',
    textEn: 'URGENT: Emergency help needed immediately!',
    textAr: '🚨 طوارئ: أحتاج مساعدة فورية الآن!',
  },
];
