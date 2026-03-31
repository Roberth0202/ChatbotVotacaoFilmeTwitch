const MAX_INPUT_LENGTH = 100;

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, MAX_INPUT_LENGTH).replace(/[<>{}]/g, '');
}

module.exports = { sanitizeInput, MAX_INPUT_LENGTH };
