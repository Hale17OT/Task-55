/** International paper sizes in inches (width x height) */
export const PAPER_SIZES: Record<string, { widthInches: number; heightInches: number }> = {
  // ISO A series
  'A0': { widthInches: 33.11, heightInches: 46.81 },
  'A1': { widthInches: 23.39, heightInches: 33.11 },
  'A2': { widthInches: 16.54, heightInches: 23.39 },
  'A3': { widthInches: 11.69, heightInches: 16.54 },
  'A4': { widthInches: 8.27, heightInches: 11.69 },
  'A5': { widthInches: 5.83, heightInches: 8.27 },
  'A6': { widthInches: 4.13, heightInches: 5.83 },
  'A7': { widthInches: 2.91, heightInches: 4.13 },
  'A8': { widthInches: 2.05, heightInches: 2.91 },
  'A9': { widthInches: 1.46, heightInches: 2.05 },
  'A10': { widthInches: 1.02, heightInches: 1.46 },
  // ISO B series
  'B0': { widthInches: 39.37, heightInches: 55.67 },
  'B1': { widthInches: 27.83, heightInches: 39.37 },
  'B2': { widthInches: 19.69, heightInches: 27.83 },
  'B3': { widthInches: 13.90, heightInches: 19.69 },
  'B4': { widthInches: 9.84, heightInches: 13.90 },
  'B5': { widthInches: 6.93, heightInches: 9.84 },
  // US sizes
  'Letter': { widthInches: 8.5, heightInches: 11 },
  'Legal': { widthInches: 8.5, heightInches: 14 },
  'Tabloid': { widthInches: 11, heightInches: 17 },
};
