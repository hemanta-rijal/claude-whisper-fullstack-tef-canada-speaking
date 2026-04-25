import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AppComponent } from './app.component';

describe('AppComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function flushHealth(): void {
    httpMock.expectOne('/api/health').flush({ ok: true, claude: false, whisper: false });
  }

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    flushHealth();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should have the app title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    flushHealth();
    expect(fixture.componentInstance.title).toEqual('Claude + Whisper');
  });

  it('should render title', () => {
    const fixture = TestBed.createComponent(AppComponent);
    flushHealth();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Claude + Whisper');
  });
});
