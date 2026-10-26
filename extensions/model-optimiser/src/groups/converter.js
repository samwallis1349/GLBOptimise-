/** The converter group's tools (see src/runners.js). */
import { modelToGlb } from '../inputs.js';
import * as converter from '../tools/convert.js';

export default {
  formats: (bytes, params, name, source) => converter.formats(bytes, params, name, source),
  convert: (bytes, params, name, source) => converter.convertTo(bytes, params, name, source),
  split: (bytes, params, name) => converter.split(bytes, params, name),
  merge: async (bytes, params, name) => {
    const others = [];
    for (const o of params.others || []) others.push({ name: o.name, bytes: (await modelToGlb(new Uint8Array(o.bytes), o.name)).bytes });
    return converter.merge(bytes, { ...params, others }, name);
  },
  lods: (bytes, params, name) => converter.lods(bytes, params, name),
};
