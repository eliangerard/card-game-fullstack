// Avatares de los jugadores: el índice (0..8) es lo que viaja en el perfil
import p1 from '../assets/p1.png';
import p2 from '../assets/p2.png';
import p3 from '../assets/p3.png';
import p4 from '../assets/p4.png';
import p5 from '../assets/p5.png';
import p6 from '../assets/p6.png';
import p7 from '../assets/p7.png';
import p8 from '../assets/p8.png';
import p9 from '../assets/p9.png';

export const AVATARS = [p1, p2, p3, p4, p5, p6, p7, p8, p9];

// Devuelve la imagen del avatar; si el índice no es válido, usa el primero
export const avatarImage = (index) => AVATARS[((Number(index) || 0) % AVATARS.length + AVATARS.length) % AVATARS.length];

export default AVATARS;
