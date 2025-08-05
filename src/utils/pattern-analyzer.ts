import { ArrayPatternAnalysis } from '../types/index';

export class PatternAnalyzer {
  static analyzeJsonStructure(data: any, path: string = ''): ArrayPatternAnalysis[] {
    const analyses: ArrayPatternAnalysis[] = [];

    if (Array.isArray(data) && data.length > 0) {
      analyses.push({
        isArray: true,
        sampleItem: data[0],
        arrayPath: path || 'root',
        itemCount: data.length
      });
    }

    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(data)) {
        const currentPath = path ? `${path}.${key}` : key;
        const subAnalyses = this.analyzeJsonStructure(value, currentPath);
        analyses.push(...subAnalyses);
      }
    }

    return analyses;
  }

  static findLargestArray(analyses: ArrayPatternAnalysis[]): ArrayPatternAnalysis | null {
    if (analyses.length === 0) return null;
    
    return analyses.reduce((largest, current) => 
      current.itemCount > largest.itemCount ? current : largest
    );
  }

  static extractArrayAtPath(data: any, path: string): any[] | null {
    if (path === 'root') {
      return Array.isArray(data) ? data : null;
    }

    const keys = path.split('.');
    let current = data;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return null;
      }
    }

    return Array.isArray(current) ? current : null;
  }
}