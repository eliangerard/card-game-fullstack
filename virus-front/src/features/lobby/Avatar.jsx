import { avatarImage } from '../../lib/avatars';

// Avatar en marco redondeado con el color del jugador (como en la mesa)
export const Avatar = ({ avatar, color = '#ffae00', size = 64, className = '', dim = false, children }) => (
  <div
    className={`avatar ${dim ? 'avatar--dim' : ''} ${className}`}
    style={{ '--avatar-color': color, '--avatar-size': `${size}px` }}
  >
    <img src={avatarImage(avatar)} alt="" draggable="false" />
    {children}
  </div>
);
