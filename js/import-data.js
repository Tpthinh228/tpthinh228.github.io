export const IMPORTABLE_KEYS = [
  'seasons', 'households', 'qualityTests', 'outputs',
  'procurements', 'products', 'activity'
];

export function buildTestDataImportValue(current, imported, mode){
  return mode === 'replace' ? imported : current.concat(imported);
}

export function prepareTestDataImport(parsed, normalizeProduct){
  if(!parsed || Array.isArray(parsed) || typeof parsed !== 'object'){
    throw new Error('File phải chứa một object dữ liệu.');
  }

  const data = {};
  const invalid = [];
  const counts = {};
  IMPORTABLE_KEYS.forEach(key => {
    const value = parsed[key];
    counts[key] = Array.isArray(value) ? value.length : 0;
    if(value === undefined) return;
    if(!Array.isArray(value)){
      invalid.push({ key, reason: 'Dữ liệu phải là một mảng.' });
      return;
    }
    data[key] = key === 'products'
      ? value.map((product, index) => normalizeProduct(product, index))
      : value;
  });

  return {
    data,
    counts,
    invalid,
    unsupported: Object.keys(parsed).filter(key => !IMPORTABLE_KEYS.includes(key))
  };
}
