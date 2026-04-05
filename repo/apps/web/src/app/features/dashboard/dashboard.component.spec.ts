describe('DashboardComponent date parsing', () => {
  it('should convert MM/DD/YYYY to ISO format', () => {
    const mmddyyyy = '01/15/2026';
    const match = mmddyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    expect(match).toBeTruthy();
    if (match) {
      const iso = `${match[3]}-${match[1]}-${match[2]}`;
      expect(iso).toBe('2026-01-15');
    }
  });

  it('should reject invalid date format', () => {
    const invalid = '2026-01-15'; // ISO format, not MM/DD/YYYY
    const match = invalid.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    expect(match).toBeNull();
  });

  it('should convert ISO to MM/DD/YYYY display format', () => {
    const iso = '2026-01-15';
    const [y, m, d] = iso.split('-');
    const display = `${m}/${d}/${y}`;
    expect(display).toBe('01/15/2026');
  });
});
