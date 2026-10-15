import '@testing-library/jest-dom/vitest';

HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
  this.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
