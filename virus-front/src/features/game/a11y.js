// Props para que un destino de la mesa (un div) funcione como botón también con el teclado:
// role="button", foco con Tab, nombre accesible y Enter/Espacio. Sin onPress no agrega nada.
export const pressable = (onPress, label, { focusable = true } = {}) => {
  if (!onPress) return {};
  return {
    role: 'button',
    tabIndex: focusable ? 0 : -1,
    'aria-label': label,
    onClick: onPress,
    onKeyDown: (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      onPress();
    },
  };
};
