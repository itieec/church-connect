import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Lang = 'en' | 'am';

const translations: Record<string, { en: string; am: string }> = {
  // Tabs & navigation
  tab_home: { en: 'Home', am: 'መነሻ' },
  tab_followup: { en: 'Follow Up', am: 'ክትትል' },
  tab_people: { en: 'People', am: 'ሰዎች' },
  tab_groups: { en: 'Groups', am: 'ቡድኖች' },
  tab_more: { en: 'More', am: 'ተጨማሪ' },

  // More menu
  more_announcements: { en: 'Announcements', am: 'ማስታወቂያዎች' },
  more_events: { en: 'Events', am: 'ዝግጅቶች' },
  more_prayer: { en: 'Prayer', am: 'ጸሎት' },
  more_one_to_one: { en: 'One-to-One', am: 'የግል ቆይታ' },
  more_attendance: { en: 'Attendance', am: 'መገኘት' },
  more_checkin: { en: 'QR Check-In', am: 'QR መግቢያ' },
  more_member_card: { en: 'My Member Card', am: 'የአባልነት መታወቂያዬ' },
  more_teams: { en: 'Ministry Teams', am: 'የአገልግሎት ቡድኖች' },
  more_contributions: { en: 'Contributions', am: 'መዋጮ' },
  more_reports: { en: 'Reports & Analytics', am: 'ሪፖርቶች' },
  more_admin: { en: 'Admin', am: 'አስተዳደር' },
  more_registration_qr: { en: 'Registration QR', am: 'የምዝገባ QR' },
  more_profile: { en: 'My Profile', am: 'መገለጫዬ' },

  // Auth
  sign_in: { en: 'Sign In', am: 'ግባ' },
  sign_up: { en: 'Create Account', am: 'መለያ ፍጠር' },
  email: { en: 'Email', am: 'ኢሜይል' },
  password: { en: 'Password', am: 'የይለፍ ቃል' },
  full_name: { en: 'Full Name', am: 'ሙሉ ስም' },
  phone: { en: 'Phone Number', am: 'ስልክ ቁጥር' },
  new_here: { en: 'New here? Create an account', am: 'አዲስ ነህ/ነሽ? መለያ ፍጠር' },
  have_account: { en: 'Already have an account? Sign in', am: 'መለያ አለህ/አለሽ? ግባ' },
  welcome: { en: 'Welcome!', am: 'እንኳን ደህና መጣህ/መጣሽ!' },
  glad_here: { en: "We're glad you're here.", am: 'በመምጣትህ/ሽ ደስ ብሎናል።' },

  // Home
  home_welcome: { en: 'Welcome', am: 'እንኳን ደህና መጣህ/መጣሽ' },
  home_events: { en: '🗓 Upcoming Events', am: '🗓 መጪ ዝግጅቶች' },
  home_announcements: { en: '📢 Announcements', am: '📢 ማስታወቂያዎች' },
  home_see_all: { en: 'See all ›', am: 'ሁሉንም እይ ›' },
  home_journey: { en: 'Member Journey', am: 'የአባልነት ጉዞ' },

  // Chat
  chat_send: { en: 'Send', am: 'ላክ' },
  chat_placeholder: { en: 'Message your group...', am: 'ለቡድንህ መልእክት ጻፍ...' },
  chat_locked_placeholder: { en: 'Only leaders can post right now', am: 'አሁን መልእክት መላክ የሚችሉት መሪዎች ብቻ ናቸው' },
  chat_empty: { en: 'No messages yet — say hello to your group! 👋', am: 'እስካሁን መልእክት የለም — ቡድንህን ሰላም በል! 👋' },
  chat_not_sent: { en: 'Not sent', am: 'አልተላከም' },
  chat_locked_or_not_member: {
    en: 'Only group members can chat here.',
    am: 'እዚህ መወያየት የሚችሉት የቡድኑ አባላት ብቻ ናቸው።',
  },
  chat_delete_title: { en: 'Delete message?', am: 'መልእክቱን ሰርዝ?' },
  chat_delete: { en: 'Delete', am: 'ሰርዝ' },
  chat_locked_banner: { en: 'Leaders-only mode is on', am: 'የመሪዎች-ብቻ ሁኔታ በርቷል' },
  chat_open_banner: { en: 'Everyone in the group can post', am: 'ሁሉም የቡድን አባል መላክ ይችላል' },
  chat_lock: { en: 'Lock', am: 'ቆልፍ' },
  chat_unlock: { en: 'Unlock', am: 'ክፈት' },

  // One-to-one
  appt_title: { en: 'One-to-One Time', am: 'የግል ቆይታ' },
  appt_request: { en: '+ Request One-to-One', am: '+ የግል ቆይታ ጠይቅ' },
  appt_my_requests: { en: 'My Requests', am: 'ጥያቄዎቼ' },

  // Common
  save: { en: 'Save', am: 'አስቀምጥ' },
  cancel: { en: 'Cancel', am: 'ተወው' },
  submit: { en: 'Submit', am: 'ላክ' },
  language: { en: 'Language', am: 'ቋንቋ' },
  sign_out: { en: 'Sign Out', am: 'ውጣ' },
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<I18nCtx>({
  lang: 'en',
  setLang: () => {},
  t: (k) => k,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    AsyncStorage.getItem('lang').then((v) => {
      if (v === 'am' || v === 'en') setLangState(v);
    });
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem('lang', l).catch(() => {});
  }, []);

  const t = useCallback(
    (key: string) => translations[key]?.[lang] ?? translations[key]?.en ?? key,
    [lang],
  );

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
