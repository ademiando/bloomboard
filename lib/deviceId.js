import { nanoid } from "nanoid";
export function getDeviceId(){ if (typeof window === 'undefined') return 'server'; let id = localStorage.getItem('bb_device_id'); if(!id){ id = nanoid(21); localStorage.setItem('bb_device_id', id);} return id; }
