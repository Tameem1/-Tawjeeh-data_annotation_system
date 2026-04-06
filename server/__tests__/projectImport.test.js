import { describe, expect, it } from 'vitest';
import { computeProjectStats, normalizeCsvHeader, parseCsvText, parseImportedFile } from '../services/projectImport.js';

describe('projectImport', () => {
  it('normalizes duplicate CSV headers', () => {
    expect(normalizeCsvHeader(['Text', 'Text', '', 'TEXT'])).toEqual([
      'Text',
      'Text_2',
      'column_3',
      'TEXT_3'
    ]);
  });

  it('parses CSV rows with quoted commas', () => {
    expect(parseCsvText('text,label\n"hello, world",greeting')).toEqual([
      ['text', 'label'],
      ['hello, world', 'greeting']
    ]);
  });

  it('imports CSV using fallback content column and selected display columns', () => {
    const { dataPoints, stats } = parseImportedFile({
      originalFilename: 'sample.csv',
      buffer: Buffer.from('id,question,label\n1,How are you?,fine\n', 'utf-8'),
      prompt: 'Classify',
      customFieldName: 'Decision',
      selectedDisplayColumns: ['id', 'label'],
      projectId: 'project-1',
      iaaConfig: { enabled: false, portionPercent: 0, annotatorsPerIAAItem: 2 }
    });

    expect(dataPoints).toHaveLength(1);
    expect(dataPoints[0].content).toBe('How are you?');
    expect(dataPoints[0].displayMetadata).toEqual({ id: '1', label: 'fine' });
    expect(stats.totalAccepted).toBe(0);
  });

  it('imports JSON arrays and preserves string fallback', () => {
    const { dataPoints } = parseImportedFile({
      originalFilename: 'sample.json',
      buffer: Buffer.from(JSON.stringify([{ text: 'hello', label: 'a' }, 'plain text item']), 'utf-8'),
      prompt: '',
      customFieldName: '',
      selectedDisplayColumns: [],
      projectId: 'project-2',
      iaaConfig: { enabled: false, portionPercent: 0, annotatorsPerIAAItem: 2 }
    });

    expect(dataPoints).toHaveLength(2);
    expect(dataPoints[0].content).toBe('hello');
    expect(dataPoints[1].content).toBe('plain text item');
  });

  it('rejects empty TXT files', () => {
    expect(() => parseImportedFile({
      originalFilename: 'sample.txt',
      buffer: Buffer.from('\n\n', 'utf-8'),
      projectId: 'project-3',
      iaaConfig: { enabled: false, portionPercent: 0, annotatorsPerIAAItem: 2 }
    })).toThrow('TXT file is empty.');
  });

  it('computes stats from imported rows', () => {
    expect(computeProjectStats([
      { status: 'accepted', aiSuggestions: {}, confidence: 0.9 },
      { status: 'edited', aiSuggestions: {}, confidence: 0.8 },
      { status: 'pending', aiSuggestions: { a: 'b' }, confidence: 0 },
      { status: 'ai_processed', aiSuggestions: {}, confidence: null }
    ])).toEqual({
      totalAccepted: 1,
      totalRejected: 1,
      totalEdited: 1,
      totalProcessed: 1,
      averageConfidence: 0.85,
      sessionTime: 0
    });
  });
});
