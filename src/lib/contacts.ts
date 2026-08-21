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

export const DEFAULT_CONTACTS: EmergencyContact[] = [
  {
    id: 'c-caregiver',
    nameEn: 'Caregiver / Supervisor',
    nameAr: 'المرافق / المشرف',
    phone: '+201000000001',
    relationship: 'caregiver',
    avatar: '👨‍⚕️',
    isPrimaryEmergency: true,
  },
  {
    id: 'c-mother',
    nameEn: 'Mother / Family',
    nameAr: 'ماما / العائلة',
    phone: '+201000000002',
    relationship: 'family',
    avatar: '👩‍🦰',
  },
  {
    id: 'c-doctor',
    nameEn: 'Specialist Doctor',
    nameAr: 'الدكتور المعالج',
    phone: '+201000000003',
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

/** Trigger phone dialer */
export function makePhoneCall(phone: string): void {
  const cleanPhone = phone.replace(/[^0-9+]/g, '');
  if (!cleanPhone) return;
  window.open(`tel:${cleanPhone}`, '_self');
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
