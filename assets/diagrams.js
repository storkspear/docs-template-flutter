const DIAGRAMS = {};

DIAGRAMS['LOCAL_DEV'] = `
<div class="aws-diagram" id="local-dev-diagram">
  <div class="aws-diagram-title">로컬 개발 구성도</div>
  <div class="ldev-stage">
    <svg class="ldev-svg" width="680" height="420" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arr-gray" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#64748b"/>
        </marker>
        <marker id="arr-pg" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#4169E1"/>
        </marker>
        <marker id="arr-minio" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#C72E28"/>
        </marker>
        <marker id="arr-nas" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#7AA116"/>
        </marker>
      </defs>
      <line x1="140" y1="205" x2="218" y2="205" stroke="#64748b" stroke-width="2" marker-end="url(#arr-gray)"/>
      <text x="179" y="197" font-size="10" fill="#94a3b8" text-anchor="middle" font-family="sans-serif">HTTP</text>
      <line x1="366" y1="190" x2="450" y2="72" stroke="#4169E1" stroke-width="2" marker-end="url(#arr-pg)"/>
      <line x1="366" y1="205" x2="450" y2="205" stroke="#C72E28" stroke-width="2" stroke-dasharray="5,3" marker-end="url(#arr-minio)"/>
      <text x="408" y="197" font-size="10" fill="#C72E28" text-anchor="middle" font-family="sans-serif">파일 업로드 테스트</text>
      <line x1="366" y1="220" x2="450" y2="336" stroke="#7AA116" stroke-width="2" stroke-dasharray="5,3" marker-end="url(#arr-nas)"/>
      <text x="420" y="295" font-size="10" fill="#7AA116" text-anchor="middle" font-family="sans-serif">LAN 직접</text>
    </svg>
    <div class="ldev-node-pos" style="left:8px;top:150px">
      <div class="aws-node compute" style="width:130px">
        <div class="aws-icon" style="background:#042B59">
          <img src="https://cdn.simpleicons.org/flutter/54C5F8" width="26" height="26" alt="Flutter">
        </div>
        <div class="aws-name">Flutter 앱</div>
        <div class="aws-sub">iOS Simulator</div>
      </div>
    </div>
    <div class="ldev-node-pos" style="left:218px;top:150px">
      <div class="aws-node compute" style="width:148px">
        <div class="aws-icon" style="background:#1A3D1E">
          <img src="https://cdn.simpleicons.org/springboot/6DB33F" width="26" height="26" alt="Spring Boot">
        </div>
        <div class="aws-name">Spring Boot</div>
        <div class="aws-sub">JVM 직접 실행 · :8081</div>
      </div>
    </div>
    <div class="ldev-node-pos" style="left:452px;top:16px">
      <div class="aws-node database" style="width:130px">
        <div class="aws-icon" style="background:#1A2F4A">
          <img src="https://cdn.simpleicons.org/postgresql/4169E1" width="26" height="26" alt="PostgreSQL">
        </div>
        <div class="aws-name">PostgreSQL</div>
        <div class="aws-sub">docker · :5433</div>
      </div>
    </div>
    <div class="ldev-node-pos" style="left:452px;top:150px">
      <div class="aws-node storage optional" style="width:130px">
        <div class="aws-icon" style="background:#3D0E0C">
          <img src="https://cdn.simpleicons.org/minio/C72E28" width="26" height="26" alt="MinIO">
        </div>
        <div class="aws-name">MinIO</div>
        <div class="aws-sub">docker · :9000 선택</div>
      </div>
    </div>
    <div class="ldev-node-pos" style="left:452px;top:284px">
      <div class="aws-node storage optional" style="width:130px">
        <div class="aws-icon" style="background:#1E2A06">
          <img src="https://cdn.simpleicons.org/minio/7AA116" width="26" height="26" alt="NAS MinIO">
        </div>
        <div class="aws-name">NAS MinIO</div>
        <div class="aws-sub">LAN · :9000 선택</div>
      </div>
    </div>
  </div>
  <div class="aws-legend">
    <span class="legend-item compute">Compute</span>
    <span class="legend-item database">Database</span>
    <span class="legend-item storage">Storage</span>
    <span style="font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:4px">
      <svg width="24" height="8"><line x1="0" y1="4" x2="24" y2="4" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4,2"/></svg>
      선택적 연결
    </span>
  </div>
</div>`;

DIAGRAMS['PROD'] = `
<div class="aws-diagram" id="prod-diagram">
  <div class="aws-diagram-title">운영 구성도</div>
  <div class="aws-prod-canvas">
    <div class="aws-prod-row">
      <div class="aws-node network" style="width:130px">
        <div class="aws-icon" style="background:#1e3a5f">
          <img src="https://cdn.simpleicons.org/internetexplorer/4dabf7" width="26" height="26" alt="Internet" onerror="this.parentElement.textContent='🌐'">
        </div>
        <div class="aws-name">인터넷 사용자</div>
      </div>
      <div class="aws-harrow">
        <span>HTTPS</span>
        <svg width="60" height="20"><line x1="0" y1="10" x2="50" y2="10" stroke="#94a3b8" stroke-width="2"/><polygon points="50,6 60,10 50,14" fill="#94a3b8"/></svg>
      </div>
      <div class="aws-node network" style="width:150px">
        <div class="aws-icon" style="background:#3D1F00">
          <img src="https://cdn.simpleicons.org/cloudflare/F38020" width="26" height="26" alt="Cloudflare">
        </div>
        <div class="aws-name">Cloudflare 엣지</div>
        <div class="aws-sub">TLS · DDoS · WAF</div>
      </div>
      <div class="aws-harrow">
        <span>Tunnel</span>
        <svg width="60" height="20"><line x1="0" y1="10" x2="50" y2="10" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4,2"/><polygon points="50,6 60,10 50,14" fill="#94a3b8"/></svg>
      </div>
      <div class="aws-group prod-host" style="flex:1">
        <div class="aws-group-label">🖥 맥미니 · OrbStack</div>
        <div class="aws-prod-inner-row">
          <div class="aws-node network" style="width:120px">
            <div class="aws-icon" style="background:#042040">
              <img src="https://cdn.simpleicons.org/kamal/0ea5e9" width="26" height="26" alt="kamal" onerror="this.parentElement.innerHTML='🔀'">
            </div>
            <div class="aws-name">kamal-proxy</div>
            <div class="aws-sub">:80 Blue/Green</div>
          </div>
          <div class="aws-harrow small">
            <svg width="40" height="20"><line x1="0" y1="10" x2="30" y2="10" stroke="#94a3b8" stroke-width="2"/><polygon points="30,6 40,10 30,14" fill="#94a3b8"/></svg>
          </div>
          <div class="aws-node compute" style="width:140px">
            <div class="aws-icon" style="background:#1A3D1E">
              <img src="https://cdn.simpleicons.org/springboot/6DB33F" width="26" height="26" alt="Spring Boot">
            </div>
            <div class="aws-name">Spring Boot</div>
            <div class="aws-sub">container :8080</div>
          </div>
        </div>
        <div class="aws-group obs-group" style="margin-top:16px">
          <div class="aws-group-label">📊 관측성 스택 (docker-compose)</div>
          <div class="aws-row" style="gap:8px">
            <div class="aws-node obs mini"><div class="aws-icon sm" style="background:#3D1200"><img src="https://cdn.simpleicons.org/prometheus/E6522C" width="20" height="20" alt="Prometheus"></div><div class="aws-name sm">Prometheus<br/>:9090</div></div>
            <div class="aws-node obs mini"><div class="aws-icon sm" style="background:#1A1A2E"><img src="https://cdn.simpleicons.org/grafana/F5A623" width="20" height="20" alt="Loki"></div><div class="aws-name sm">Loki<br/>:3100</div></div>
            <div class="aws-node obs mini"><div class="aws-icon sm" style="background:#2A1800"><img src="https://cdn.simpleicons.org/grafana/F46800" width="20" height="20" alt="Grafana"></div><div class="aws-name sm">Grafana<br/>:3000</div></div>
            <div class="aws-node obs mini"><div class="aws-icon sm" style="background:#2A001A"><img src="https://cdn.simpleicons.org/prometheus/E01E5A" width="20" height="20" alt="Alertmanager"></div><div class="aws-name sm">Alertmanager<br/>:9093</div></div>
          </div>
        </div>
      </div>
    </div>
    <div class="aws-prod-row ext-row">
      <div style="flex:1"></div>
      <div class="aws-ext-connectors">
        <div class="aws-ext-item">
          <div class="aws-varrow">
            <svg width="20" height="40"><line x1="10" y1="0" x2="10" y2="30" stroke="#94a3b8" stroke-width="2"/><polygon points="6,30 14,30 10,40" fill="#94a3b8"/></svg>
            <span>JDBC :6543</span>
          </div>
          <div class="aws-node database" style="width:130px">
            <div class="aws-icon" style="background:#0D2918">
              <img src="https://cdn.simpleicons.org/supabase/3ECF8E" width="26" height="26" alt="Supabase">
            </div>
            <div class="aws-name">Supabase Seoul</div>
            <div class="aws-sub">PostgreSQL</div>
          </div>
        </div>
        <div class="aws-ext-item">
          <div class="aws-varrow">
            <svg width="20" height="40"><line x1="10" y1="0" x2="10" y2="30" stroke="#94a3b8" stroke-width="2"/><polygon points="6,30 14,30 10,40" fill="#94a3b8"/></svg>
            <span>S3 API</span>
          </div>
          <div class="aws-node storage" style="width:130px">
            <div class="aws-icon" style="background:#1E2A06">
              <img src="https://cdn.simpleicons.org/minio/7AA116" width="26" height="26" alt="MinIO">
            </div>
            <div class="aws-name">NAS MinIO</div>
            <div class="aws-sub">Tailscale LAN</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="aws-legend">
    <span class="legend-item compute">Compute</span>
    <span class="legend-item database">Database</span>
    <span class="legend-item storage">Storage</span>
    <span class="legend-item network">Network</span>
    <span class="legend-item obs">Observability</span>
  </div>
</div>`;

DIAGRAMS['ARCH_OVERVIEW'] = `
<div class="aws-diagram" id="arch-overview-diagram">
  <div class="aws-diagram-title">FeatureKit 아키텍처 — 4 계층</div>
  <div class="arch-col">
    <div class="aws-node" style="min-width:240px"><div class="aws-icon" style="background:#0f172a"><img src="https://cdn.simpleicons.org/dart/2CB7F6" width="24" height="24" alt="Dart"></div><div class="aws-name">main.dart + app.dart</div><div class="aws-sub">엔트리포인트 · MaterialApp</div></div>
    <div class="stack-arrow" style="margin-left:0">▼</div>
    <div class="arch-row">
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#7c3aed"><span class="stack-chip">F</span></div><div class="aws-name sm">features/</div><div class="aws-sub">도메인 화면 — 파생 레포가 채움</div></div>
      <div class="arch-link">→</div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#0369a1"><span class="stack-chip">C</span></div><div class="aws-name sm">common/</div><div class="aws-sub">DI · 라우터 · 스플래시</div></div>
      <div class="arch-link">→</div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#166534"><span class="stack-chip">K</span></div><div class="aws-name sm">kits/</div><div class="aws-sub">14개 기능 Kit — 선택 조립</div></div>
    </div>
    <div class="stack-arrow" style="margin-left:0">▼&nbsp;&nbsp;세 계층 모두 core 를 사용해요&nbsp;&nbsp;▼</div>
    <div class="aws-node" style="min-width:300px"><div class="aws-icon" style="background:#042B59"><img src="https://cdn.simpleicons.org/flutter/54C5F8" width="24" height="24" alt="core"></div><div class="aws-name">core/</div><div class="aws-sub">theme · storage · cache · i18n · widgets · kits 계약</div></div>
  </div>
</div>`;

DIAGRAMS['TECH_STACK'] = `
<div class="aws-diagram" id="tech-stack-diagram">
  <div class="aws-diagram-title">기술 스택 한눈 보기 — template-flutter</div>

  <div class="stack-row">
    <div class="stack-label" style="background:#042B59">코어</div>
    <div class="stack-nodes">
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#042B59"><img src="https://cdn.simpleicons.org/flutter/54C5F8" width="18" height="18" alt="Flutter"></div><div class="aws-name sm">Flutter</div><div class="aws-sub">멀티플랫폼 UI</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#0f172a"><img src="https://cdn.simpleicons.org/dart/2CB7F6" width="18" height="18" alt="Dart"></div><div class="aws-name sm">Dart</div><div class="aws-sub">언어</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#1e40af"><span class="stack-chip">Rv</span></div><div class="aws-name sm">Riverpod 2.6</div><div class="aws-sub">StateNotifier MVVM</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#0369a1"><span class="stack-chip">Go</span></div><div class="aws-name sm">GoRouter 14.8</div><div class="aws-sub">ShellRoute · redirect 게이트</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#0e7490"><span class="stack-chip">Dio</span></div><div class="aws-name sm">Dio 5.x</div><div class="aws-sub">인터셉터 3종 · SSL 핀닝</div></div>
    </div>
  </div>

  <div class="stack-row">
    <div class="stack-label" style="background:#1e40af">저장</div>
    <div class="stack-nodes">
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#312e81"><span class="stack-chip">Dr</span></div><div class="aws-name sm">Drift 2.23</div><div class="aws-sub">로컬 SQLite DB</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#334155"><span class="stack-chip">SS</span></div><div class="aws-name sm">SecureStorage</div><div class="aws-sub">토큰 (Keychain/Keystore)</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#334155"><span class="stack-chip">SP</span></div><div class="aws-name sm">SharedPreferences</div><div class="aws-sub">일반 설정</div></div>
    </div>
  </div>

  <div class="stack-row">
    <div class="stack-label" style="background:#166534">인증</div>
    <div class="stack-nodes">
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#f8fafc"><img src="https://cdn.simpleicons.org/google/4285F4" width="18" height="18" alt="Google"></div><div class="aws-name sm">Google</div><div class="aws-sub">Sign-In SDK</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#0f172a"><img src="https://cdn.simpleicons.org/apple/ffffff" width="18" height="18" alt="Apple"></div><div class="aws-name sm">Apple</div><div class="aws-sub">Sign in with Apple</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#FEE500"><img src="https://cdn.simpleicons.org/kakao/000000" width="18" height="18" alt="Kakao"></div><div class="aws-name sm">Kakao</div><div class="aws-sub">SDK 1.9</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#03C75A"><span class="stack-chip">N</span></div><div class="aws-name sm">Naver</div><div class="aws-sub">SDK 2.1</div></div>
    </div>
  </div>

  <div class="stack-row">
    <div class="stack-label" style="background:#9a3412">플랫폼</div>
    <div class="stack-nodes">
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#ea580c"><span class="stack-chip">Ad</span></div><div class="aws-name sm">AdMob 5.3</div><div class="aws-sub">ATT · UMP 동의 자동</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#7c2d12"><span class="stack-chip">WM</span></div><div class="aws-name sm">WorkManager 0.9</div><div class="aws-sub">백그라운드 작업</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#b45309"><span class="stack-chip">LN</span></div><div class="aws-name sm">로컬 알림 18</div><div class="aws-sub">FCM 은 provider 교체형</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#0e7490"><span class="stack-chip">FC</span></div><div class="aws-name sm">fl_chart 0.70</div><div class="aws-sub">차트</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#475569"><span class="stack-chip">SK</span></div><div class="aws-name sm">skeletonizer 1.4</div><div class="aws-sub">로딩 UX 규약</div></div>
    </div>
  </div>

  <div class="stack-row">
    <div class="stack-label" style="background:#6d28d9">관측성 (옵션)</div>
    <div class="stack-nodes">
      <div class="aws-node mini optional"><div class="aws-icon sm" style="background:#362d59"><img src="https://cdn.simpleicons.org/sentry/ffffff" width="18" height="18" alt="Sentry"></div><div class="aws-name sm">Sentry 8.9</div><div class="aws-sub">크래시 — 키 주입 시 활성</div></div>
      <div class="aws-node mini optional"><div class="aws-icon sm" style="background:#f8fafc"><img src="https://cdn.simpleicons.org/posthog/1D4AFF" width="18" height="18" alt="PostHog"></div><div class="aws-name sm">PostHog 4.10</div><div class="aws-sub">제품 분석 — 키 주입 시 활성</div></div>
    </div>
  </div>

  <div class="stack-row">
    <div class="stack-label" style="background:#475569">품질 · 배포</div>
    <div class="stack-nodes">
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#334155"><span class="stack-chip">VG</span></div><div class="aws-name sm">very_good_analysis</div><div class="aws-sub">린트 룰셋</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#f8fafc"><img src="https://cdn.simpleicons.org/fastlane/00F200" width="18" height="18" alt="fastlane"></div><div class="aws-name sm">fastlane</div><div class="aws-sub">Android 4-lane 배포</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#eff6ff"><img src="https://cdn.simpleicons.org/githubactions/2088FF" width="18" height="18" alt="GitHub Actions"></div><div class="aws-name sm">GitHub Actions</div><div class="aws-sub">CI · release</div></div>
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#0f172a"><span class="stack-chip">F</span></div><div class="aws-name sm">factory CLI</div><div class="aws-sub">local/dev/prod 셋업 · 검증</div></div>
    </div>
  </div>

  <div class="stack-arrow">▼&nbsp;&nbsp;REST <code>{data,error}</code> 계약&nbsp;&nbsp;▼</div>
  <div class="stack-row">
    <div class="stack-label" style="background:#166534">백엔드 짝</div>
    <div class="stack-nodes">
      <div class="aws-node mini"><div class="aws-icon sm" style="background:#f1f8f4"><img src="https://cdn.simpleicons.org/springboot/6DB33F" width="18" height="18" alt="Spring Boot"></div><div class="aws-name sm">template-spring</div><div class="aws-sub">1:1 계약 · contract test 동기</div></div>
    </div>
  </div>
</div>`;
