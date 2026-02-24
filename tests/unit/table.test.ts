import { describe, it, expect } from 'vitest';
import { formatTable, type Column } from '../../src/utils/table.js';

describe('formatTable', () => {
  const basicColumns: Column[] = [
    { header: 'Name', key: 'name' },
    { header: 'Value', key: 'value' },
  ];

  it('formats a simple table with header, separator, and rows', () => {
    const rows = [
      { name: 'foo', value: 'bar' },
      { name: 'baz', value: 'qux' },
    ];
    const result = formatTable(rows, basicColumns);
    const lines = result.split('\n');

    // Header, separator, 2 data rows
    expect(lines).toHaveLength(4);
  });

  it('header line contains column names', () => {
    const rows = [{ name: 'a', value: 'b' }];
    const result = formatTable(rows, basicColumns);
    const lines = result.split('\n');
    // Strip ANSI codes for comparison
    const headerStripped = lines[0].replace(/\x1b\[[0-9;]*m/g, '');
    expect(headerStripped).toContain('Name');
    expect(headerStripped).toContain('Value');
  });

  it('separator line uses ─ characters', () => {
    const rows = [{ name: 'a', value: 'b' }];
    const result = formatTable(rows, basicColumns);
    const lines = result.split('\n');
    expect(lines[1]).toMatch(/[─]+/);
  });

  it('data rows contain the values', () => {
    const rows = [{ name: 'hello', value: 'world' }];
    const result = formatTable(rows, basicColumns);
    const lines = result.split('\n');
    expect(lines[2]).toContain('hello');
    expect(lines[2]).toContain('world');
  });

  it('handles empty rows array', () => {
    const result = formatTable([], basicColumns);
    const lines = result.split('\n');
    // Header + separator only
    expect(lines).toHaveLength(2);
  });

  it('handles single row', () => {
    const rows = [{ name: 'only', value: 'one' }];
    const result = formatTable(rows, basicColumns);
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
  });

  it('respects fixed column width', () => {
    const columns: Column[] = [
      { header: 'X', key: 'x', width: 10 },
    ];
    const rows = [{ x: 'hi' }];
    const result = formatTable(rows, columns);
    const lines = result.split('\n');
    // The separator should be 10 ─ chars
    expect(lines[1]).toBe('─'.repeat(10));
  });

  it('auto-sizes columns to fit longest value', () => {
    const columns: Column[] = [{ header: 'A', key: 'a' }];
    const rows = [{ a: 'short' }, { a: 'a much longer value here' }];
    const result = formatTable(rows, columns);
    const lines = result.split('\n');
    // Separator width should match the longest value
    const sepLen = lines[1].length;
    expect(sepLen).toBe('a much longer value here'.length);
  });

  it('right-aligns columns', () => {
    const columns: Column[] = [
      { header: 'Num', key: 'n', width: 10, align: 'right' },
    ];
    const rows = [{ n: '42' }];
    const result = formatTable(rows, columns);
    const lines = result.split('\n');
    const dataLine = lines[2];
    // Value should be right-padded with leading spaces
    expect(dataLine).toMatch(/^\s+42$/);
  });

  it('center-aligns columns', () => {
    const columns: Column[] = [
      { header: 'Mid', key: 'm', width: 10, align: 'center' },
    ];
    const rows = [{ m: 'hi' }];
    const result = formatTable(rows, columns);
    const lines = result.split('\n');
    const dataLine = lines[2];
    // 'hi' is 2 chars, width 10 → 4 spaces left, 4 spaces right
    expect(dataLine.length).toBe(10);
    expect(dataLine.trim()).toBe('hi');
    // Check it's not left-aligned (has leading spaces)
    expect(dataLine).toMatch(/^\s+hi/);
  });

  it('uses format function when provided', () => {
    const columns: Column[] = [
      { header: 'Val', key: 'v', format: (v) => `[${v}]` },
    ];
    const rows = [{ v: 'x' }];
    const result = formatTable(rows, columns);
    expect(result).toContain('[x]');
  });

  it('handles missing keys gracefully', () => {
    const columns: Column[] = [
      { header: 'A', key: 'a' },
      { header: 'B', key: 'b' },
    ];
    const rows = [{ a: 'yes' }]; // missing 'b'
    const result = formatTable(rows, columns);
    // Should not throw, and row should exist
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
  });
});
