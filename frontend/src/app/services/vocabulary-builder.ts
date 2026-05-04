import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

const API = environment.apiUrl;

/** Mirrors backend vocabularyFamilleMemberSchema. */
export type VocabularyFamilleMember = {
  w: string;
  p: string;
  wEn: string;
  pEn: string;
};

export type VocabularyBuildResult = {
  word: string;
  wordEn: string;
  pos: string;
  posEn: string;
  fd: string;
  fdEn: string;
  diss: string;
  dissEn: string;
  famille: VocabularyFamilleMember[];
};

@Injectable({ providedIn: 'root' })
export class VocabularyBuilderService {
  private http = inject(HttpClient);

  async build(expression: string): Promise<VocabularyBuildResult> {
    return firstValueFrom(
      this.http.post<VocabularyBuildResult>(`${API}/vocabulary/build`, { expression }),
    );
  }
}
