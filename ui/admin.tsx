import { Link, useLocation } from 'react-router-dom';
import { useAdmin } from './hooks/useAdmin';
import {
  ActionButton,
  Eyebrow,
  FormSurface,
  SelectField,
  Surface,
  TextField,
} from './components/primitives';
import type { LanguageConfig } from './types';

type AdminProps = {
  languages: LanguageConfig[];
  onCollect: (language: string) => Promise<void>;
};

export function AdminPage({ languages, onCollect }: AdminProps) {
  const { pathname } = useLocation();
  const section = pathname.split('/').filter(Boolean)[1] ?? 'harness';
  const isFeeds = section === 'feeds';
  const isReward = section === 'reward';
  const isRag = section === 'rag';
  const isHarness = !isFeeds && !isReward && !isRag;
  const {
    feeds,
    articles,
    url,
    setUrl,
    name,
    setName,
    language,
    setLanguage,
    verification,
    setVerification,
    message,
    error,
    busy,
    study,
    qualityJudge,
    benchmark,
    verifyUrl,
    addSubscription,
    pollNow,
    compareBatch,
    runQualityJudge,
    toggleFeed,
    verifyFeed,
    deleteFeed,
  } = useAdmin(languages[0]?.code ?? 'en');
  const newArticles = articles.filter((article) => article.status === 'new');
  const baselineArticles = articles.filter((article) => article.status === 'baseline');

  return (
    <section className="admin-page">
      <div className="admin-standalone-bar">
        <a className="ds-button ds-button-secondary" href="/">
          ← Daily Phrase
        </a>
        <Eyebrow>ADMIN WORKSPACE</Eyebrow>
      </div>
      <nav className="admin-section-nav" aria-label="관리자 섹션">
        <Link className={isHarness ? 'active' : ''} to="/admin/harness">성능 · 하네스</Link>
        <Link className={isReward ? 'active' : ''} to="/admin/reward">RL 보상</Link>
        <Link className={isRag ? 'active' : ''} to="/admin/rag">RAG</Link>
        <Link className={isFeeds ? 'active' : ''} to="/admin/feeds">구독 관리</Link>
      </nav>
      <header className="admin-header">
        <div>
          <div className="eyebrow muted">{isFeeds ? 'LOCAL FEED MANAGER' : 'MODEL STUDY WORKSPACE'}</div>
          <h1>{isFeeds ? '아티클 구독 관리' : isReward ? 'RL 보상 신호' : isRag ? 'RAG 지식베이스 실험' : '다국어 성능 · 평가 하네스'}</h1>
          <p>{isFeeds ? 'RSS 구독과 발견한 아티클을 관리합니다.' : isReward ? '코드로 검증할 수 있는 학습 보상 항목과 현재 판정 결과를 확인합니다.' : isRag ? '허가된 표현 자료와 검색 필요 사례의 준비 상태를 관리합니다.' : '고정 평가셋으로 기준선과 실험 후보의 품질을 비교합니다.'}</p>
        </div>
        {isFeeds && <div className="admin-header-actions">
          <ActionButton
            tone="secondary"
            className="admin-poll-button"
            disabled={busy || feeds.length === 0}
            onClick={compareBatch}
            type="button"
          >
            배치 비교
          </ActionButton>
          <ActionButton
            tone="secondary"
            className="admin-poll-button"
            disabled={busy || feeds.length === 0}
            onClick={pollNow}
            type="button"
          >
            ↻ 새 글 확인
          </ActionButton>
        </div>}
      </header>

      {isFeeds && <div className="admin-local-note">
        <b>로컬 관리자</b>
        <span>구독 목록과 발견한 글은 이 컴퓨터의 JSON 파일에 저장됩니다.</span>
      </div>}
      {message && <div className="admin-message">{message}</div>}
      {error && <div className="admin-error">{error}</div>}
      {isFeeds && study && (
        <Surface className="admin-study-card">
          <div className="admin-card-title">
            <div>
              <span className="panel-kicker">BATCH CONCURRENCY STUDY</span>
              <h2>배치 처리 비교</h2>
            </div>
            <span className="admin-inbox-total">읽기 전용 · 피드 상태를 변경하지 않음</span>
          </div>
          <div className="admin-study-grid">
            {study.runs.map((run) => (
              <article className="admin-study-result" key={run.concurrency}>
                <b>동시성 {run.concurrency}</b>
                <span>{run.mean_duration_ms} ms 평균</span>
                <small>
                  p95 {run.p95_duration_ms} ms · {run.scans_per_second} scans/s
                </small>
                <small>
                  성공 {run.successful_scans} · 실패 {run.failed_scans}
                </small>
              </article>
            ))}
          </div>
          <p className="admin-help">
            네트워크 상태와 원격 피드 응답시간이 결과에 포함됩니다. 자세한 반복 측정은{' '}
            <code>npm run study:batch</code>를 사용하세요.
          </p>
        </Surface>
      )}

      {isHarness && <Surface className="admin-study-card">
        <div className="admin-card-title">
          <div>
            <span className="panel-kicker">WEEK 5 · MULTILINGUAL BENCHMARK</span>
            <h2>다국어 성능 기준선과 보상 하네스</h2>
          </div>
          {benchmark && <span className="admin-inbox-total">후보 모델 비교 전 · 개선 판정 보류</span>}
        </div>
        {!benchmark ? (
          <p className="admin-empty">저장된 보상 하네스 결과가 없습니다. `npm run evaluate:reward` 실행 후 새로고침하세요.</p>
        ) : (
          <>
            <p className="admin-help">
              이 화면은 동일한 held-out 40건의 현재 기준선과 코드 검사 결과를 보여줍니다. RL/SFT/RAG 후보 실행이 없어 아직 개선 여부를 판단할 수 없습니다.
              코드 보상 통과는 자연스러움·의미 정확성의 점수가 아닙니다.
            </p>
            <div className="admin-study-grid">
              <article className="admin-study-result">
                <b>현재 기준선 · {benchmark.baseline.model.requested}</b>
                <span>{benchmark.reward.dataset.id} · {benchmark.reward.dataset.cases}건</span>
                <small>Digest {benchmark.baseline.model.digest.slice(0, 16)}…</small>
                <small>평가 {new Date(benchmark.baseline.timestamp).toLocaleString()}</small>
              </article>
              <article className="admin-study-result">
                <b>보상 적격 출력</b>
                <span>{Object.values(benchmark.reward.per_language).reduce((n, row) => n + row.eligible_outputs, 0)} / {benchmark.reward.dataset.cases}</span>
                <small>합성 코드 보상 기준 통과</small>
                <small>하네스 {new Date(benchmark.reward.timestamp).toLocaleString()}</small>
              </article>
              <article className="admin-study-result">
                <b>주입 오류 탐지</b>
                <span>{benchmark.reward.injected_errors.detected} / {benchmark.reward.injected_errors.total}</span>
                <small>{benchmark.reward.injected_errors.kinds.length}개 오류 유형</small>
                <small>같은 고정 출력을 반복 재채점</small>
              </article>
              <article className="admin-study-result">
                <b>평가 반복 일치</b>
                <span>{benchmark.reward.repeatability.stable_cases} / {benchmark.reward.repeatability.total_cases}</span>
                <small>{benchmark.reward.repeatability.repetitions_per_fixed_output}회 결정성 확인</small>
                <small>생성 모델의 반복 안정성 측정은 아님</small>
              </article>
            </div>
            <div className="admin-judge-table-wrap">
              <table className="admin-judge-table">
                <thead><tr><th>언어</th><th>요청 성공</th><th>원문 근거</th><th>보상 적격</th><th>보상 통과율</th><th>기준선 발음 필드</th><th>주입 오류 탐지</th></tr></thead>
                <tbody>{Object.entries(benchmark.reward.per_language).map(([code, row]) => {
                  const baselineRow = benchmark.baseline.summary[code];
                  return <tr key={code}>
                    <td>{code.toUpperCase()}</td>
                    <td>{row.successful_generations}/{row.cases}</td>
                    <td>{row.checks.source_grounded?.passed ?? '—'}/{row.cases}</td>
                    <td>{row.eligible_outputs}/{row.cases}</td>
                    <td>{row.mean_code_reward === null ? '—' : `${(row.mean_code_reward * 100).toFixed(0)}%`}</td>
                    <td>{baselineRow ? `${baselineRow.pronunciation_present}/${baselineRow.cases}` : '—'}</td>
                    <td>{row.injected_errors.detected}/{row.injected_errors.total}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            <p className="admin-help">
              RAG: {benchmark.reward.rag.status === 'not_run' ? '실행 안 함' : benchmark.reward.rag.status} — {benchmark.reward.rag.reason}
              {' '}기준선 결과 파일: <code>{benchmark.reward.baseline.file}</code>
            </p>
            <details className="admin-benchmark-details">
              <summary>해석 범위와 제한 사항</summary>
              <ul>{benchmark.reward.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
            </details>
          </>
        )}
      </Surface>}

      {isReward && <Surface className="admin-study-card">
        <div className="admin-card-title"><div><span className="panel-kicker">REWARD SIGNAL · BASELINE AUDIT</span><h2>코드 보상 항목별 결과</h2></div></div>
        {!benchmark ? <p className="admin-empty">보상 하네스 결과가 없습니다. `npm run evaluate:reward` 실행 후 새로고침하세요.</p> : <>
          <p className="admin-help">현재 점수는 기존 기준선 출력에 보상 검사를 적용한 결과입니다. RL 학습 후보는 아직 없어 개선 비교가 아닙니다. 모든 보상 항목이 통과해야 적격으로 집계되며, 적격은 언어 품질의 증명이 아닙니다.</p>
          <div className="admin-study-grid">
            <article className="admin-study-result"><b>보상 적격</b><span>{Object.values(benchmark.reward.per_language).reduce((n, row) => n + row.eligible_outputs, 0)}/{benchmark.reward.dataset.cases}</span><small>기준선 · {benchmark.reward.baseline.model.requested}</small></article>
            <article className="admin-study-result"><b>보상 정의 버전</b><span>{benchmark.reward.reward_revision_sha256?.slice(0, 12) ?? '기록 없음'}</span><small>SHA-256</small></article>
          </div>
          <div className="admin-judge-table-wrap"><table className="admin-judge-table">
            <thead><tr><th>언어</th><th>사례</th><th>스키마</th><th>원문 근거</th><th>길이</th><th>스크립트</th><th>발음 형식</th><th>한국어 필드</th><th>합성 보상</th></tr></thead>
            <tbody>{Object.entries(benchmark.reward.per_language).map(([code, row]) => <tr key={code}>
              <td>{code.toUpperCase()}</td><td>{row.cases}</td>
              {['schema_valid','source_grounded','phrase_length_valid','target_script_compatible','pronunciation_format_valid','korean_fields_present'].map((key) => <td key={key}>{row.checks[key]?.passed ?? '—'}/{row.cases}</td>)}
              <td>{row.eligible_outputs}/{row.cases}</td>
            </tr>)}</tbody>
          </table></div>
          <p className="admin-help">의미 정확성, 문맥 적합성, 초급 유용성, 발음 정확성은 이 코드 보상으로 검증되지 않습니다.</p>
        </>}
      </Surface>}

      {isRag && <Surface className="admin-study-card">
        <div className="admin-card-title"><div><span className="panel-kicker">RETRIEVAL AUGMENTED GENERATION</span><h2>RAG 지식베이스 실험</h2></div><span className="admin-inbox-total">현재 미실행</span></div>
        <p className="admin-help">RAG는 검증셋에서 검색으로 해결할 필요가 확인되고, 사용 권리가 확인된 표현 자료가 준비될 때만 별도 비교합니다. 현재는 허가된 코퍼스가 확인되지 않아 지식베이스를 만들지 않았습니다.</p>
        <div className="admin-study-grid">
          <article className="admin-study-result"><b>평가 사례</b><span>40건 held-out</span><small>검색 인덱스에 포함 금지</small></article>
          <article className="admin-study-result"><b>검색 자료</b><span>미확보</span><small>자료 출처와 사용 권리 기록 필요</small></article>
          <article className="admin-study-result"><b>실험 상태</b><span>{benchmark?.reward.rag.status === 'not_run' || !benchmark ? '미실행' : benchmark.reward.rag.status}</span><small>검색 적중과 근거성, 오류 변화를 측정</small></article>
        </div>
        {benchmark && <p className="admin-help">기록된 사유: {benchmark.reward.rag.reason}</p>}
        <div className="admin-rag-plan"><b>비교 시 고정할 조건</b><span>같은 평가 사례 · 생성 모델과 프롬프트 · 평가 루브릭</span><span>RAG 전후 검색 적중 · 원문 근거 · 언어별 오류 수</span></div>
      </Surface>}

      {isHarness && <Surface className="admin-study-card">
        <div className="admin-card-title">
          <div>
            <span className="panel-kicker">WEEK 4 · LOCAL QUALITY JUDGE</span>
            <h2>로컬 Qwen 평가 결과</h2>
          </div>
          <div className="admin-judge-actions">
            <ActionButton
              tone="primary"
              disabled={busy}
              onClick={() => runQualityJudge('quick')}
              type="button"
            >
              빠른 평가 · 4건
            </ActionButton>
            <ActionButton
              tone="secondary"
              disabled={busy}
              onClick={() => runQualityJudge('full')}
              type="button"
            >
              전체 평가 · 40건
            </ActionButton>
          </div>
        </div>
        <p className="admin-help">
          빠른 평가는 언어별 1건씩 확인하며, 전체 평가는 40건을 모두 처리합니다. 동일 기준선·평가 모델·루브릭의
          기존 결과가 있으면 재사용합니다. Ollama에서 평가하며 외부 평가 API로 전송하지 않습니다. 결과는 원어민
          판단이나 실제 사용 빈도의 증거가 아닌 참고용 점수입니다.
        </p>
        {!qualityJudge ? (
          <p className="admin-empty">아직 로컬 평가 결과가 없습니다. 기준선 결과가 준비되었는지 확인하고 실행하세요.</p>
        ) : (
          <>
            <div className="admin-study-grid">
              <article className="admin-study-result">
                <b>
                  {qualityJudge.evaluation_mode === 'quick' ? '빠른 표본' : '전체 평가'} ·{' '}
                  {qualityJudge.evaluator_model}
                </b>
                <span>{qualityJudge.cases.length}건 평가</span>
                <small>생성 모델 {qualityJudge.generator_model}</small>
                <small>기준선 {qualityJudge.dataset.id} · {qualityJudge.dataset.cases}건</small>
              </article>
              <article className="admin-study-result">
                <b>최근 평가</b>
                <span>{new Date(qualityJudge.timestamp).toLocaleString()}</span>
                <small>루브릭 SHA-256 {qualityJudge.evaluator_rubric_revision.slice(0, 12)}</small>
                <small>모델 자기 평가 편향 가능</small>
              </article>
            </div>
            <div className="admin-judge-table-wrap">
              <table className="admin-judge-table">
                <thead><tr><th>사례</th><th>언어</th><th>표현</th><th>원문 포함</th><th>자연스러움</th><th>문맥 적합성</th><th>초급 유용성</th><th>언어 정확성</th><th>필드 품질</th><th>확신</th></tr></thead>
                <tbody>{qualityJudge.cases.map((item) => (
                  <tr key={item.case_id}>
                    <td>{item.case_id}</td><td>{item.language.toUpperCase()}</td><td>{item.phrase}</td>
                    <td>{item.code_checks.grounded_in_source ? '예' : '아니오'}</td>
                    <td>{item.judgment.naturalness}</td><td>{item.judgment.context_fit}</td>
                    <td>{item.judgment.beginner_usefulness}</td><td>{item.judgment.language_quality}</td>
                    <td>{item.judgment.field_quality}</td><td>{item.judgment.confidence}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="admin-help">{qualityJudge.interpretation}</p>
          </>
        )}
      </Surface>}

      {isFeeds && <><div className="admin-layout">
        <FormSurface className="admin-form" onSubmit={addSubscription}>
          <div className="admin-card-title">
            <div>
              <span className="panel-kicker">NEW SUBSCRIPTION</span>
              <h2>아티클 소스 추가</h2>
            </div>
            <span className="admin-card-icon">＋</span>
          </div>
          <label>
            소스 URL
            <TextField
              autoComplete="url"
              placeholder="https://example.com/feed.xml 또는 블로그 주소"
              required
              type="url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setVerification(null);
              }}
            />
          </label>
          <div className="admin-form-row">
            <label>
              표시 이름
              <TextField
                maxLength={100}
                placeholder="예: VOA Learning English"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              학습 언어
              <SelectField value={language} onChange={(event) => setLanguage(event.target.value)}>
                {languages.map((item) => (
                  <option value={item.code} key={item.code}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </SelectField>
            </label>
          </div>
          <div className="admin-form-actions">
            <ActionButton
              tone="secondary"
              className="admin-secondary-button"
              disabled={busy || !url}
              onClick={verifyUrl}
              type="button"
            >
              주소 확인
            </ActionButton>
            <ActionButton
              className="primary-button"
              tone="primary"
              disabled={busy || !url}
              type="submit"
            >
              구독 추가 <b>↗</b>
            </ActionButton>
          </div>
          {verification && (
            <div className="verification-result">
              <b>확인됨 · {verification.entry_count}개 아티클 항목</b>
              <small>
                {verification.source_type} · {verification.url}
              </small>
              {verification.sample.map((item) => (
                <span key={item.url}>{item.title}</span>
              ))}
            </div>
          )}
          <p className="admin-help">
            RSS/Atom 주소를 직접 넣거나, 해당 피드가 연결된 블로그 페이지 주소를 넣으세요. 페이지에
            피드 자동 발견 정보가 있어야 합니다.
          </p>
        </FormSurface>

        <Surface className="admin-subscribed-sources">
          <div className="admin-card-title">
            <div>
              <span className="panel-kicker">SUBSCRIBED SOURCES</span>
              <h2>
                구독 중인 소스 <small>{feeds.length}</small>
              </h2>
            </div>
          </div>
          {feeds.length === 0 ? (
            <p className="admin-empty">아직 등록된 소스가 없습니다. URL을 추가해 시작하세요.</p>
          ) : (
            <div className="admin-feed-list">
              {feeds.map((feed) => (
                <article className="admin-feed-row" key={feed.id}>
                  <span className="admin-feed-language">{feed.language.toUpperCase()}</span>
                  <div className="admin-feed-info">
                    <b>
                      {feed.name}
                      {feed.is_default ? ' · 기본 구독' : ''}
                    </b>
                    <a href={feed.rss_url} target="_blank" rel="noreferrer">
                      {feed.rss_url}
                    </a>
                    <small>
                      {!feed.verified
                        ? 'RSS 확인 필요'
                        : feed.last_error
                          ? `오류: ${feed.last_error.message}`
                          : feed.last_checked_at
                            ? `마지막 확인 ${new Date(feed.last_checked_at).toLocaleString()}`
                            : '아직 수집 전'}
                    </small>
                  </div>
                  <div className="admin-feed-actions">
                    {!feed.verified && (
                      <button disabled={busy} onClick={() => verifyFeed(feed)} type="button">
                        RSS 확인
                      </button>
                    )}
                    <button onClick={() => toggleFeed(feed)} type="button">
                      {feed.enabled ? '일시 중지' : '다시 구독'}
                    </button>
                    <button className="remove" onClick={() => deleteFeed(feed)} type="button">
                      삭제
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Surface>
      </div>

      <Surface className="admin-inbox">
        <div className="admin-card-title">
          <div>
            <span className="panel-kicker">DISCOVERED ARTICLES</span>
            <h2>
              새 글 보관함 <small>{newArticles.length}개 대기</small>
            </h2>
          </div>
          <span className="admin-inbox-total">전체 {articles.length}</span>
        </div>
        {newArticles.length === 0 ? (
          <p className="admin-empty">
            새 글이 없습니다. “새 글 확인”을 눌러 구독 피드를 확인하세요. 첫 확인은 현재 피드 항목을
            기준점으로 기록하고, 다음 확인부터 새 항목을 보관함에 넣습니다.
          </p>
        ) : (
          <div className="admin-article-list">
            {newArticles.slice(0, 100).map((article) => (
              <article className="admin-article-row" key={article.id}>
                <div className="admin-article-meta">
                  <span>{article.language.toUpperCase()}</span>
                  <b>{article.feed_name}</b>
                  <small>{article.published_at || article.discovered_at}</small>
                </div>
                <a href={article.url} target="_blank" rel="noreferrer">
                  {article.title}
                </a>
                <button
                  className="collect-article-button"
                  onClick={() => onCollect(article.language)}
                  type="button"
                >
                  오늘의 표현으로 가져오기 <span>↗</span>
                </button>
              </article>
            ))}
          </div>
        )}
      </Surface>
      {baselineArticles.length > 0 && (
        <Surface className="admin-inbox">
          <div className="admin-card-title">
            <div>
              <span className="panel-kicker">INITIAL IMPORT</span>
              <h2>
                초기 적재 기사 <small>{baselineArticles.length}개</small>
              </h2>
            </div>
            <span className="admin-inbox-total">새 기사 아님</span>
          </div>
          <p className="admin-help">
            기본 구독의 첫 수집에서 가져온 기존 기사입니다. 다음 수집부터 새 기사를 오늘의 표현
            후보로 표시합니다.
          </p>
          <div className="admin-article-list">
            {baselineArticles.slice(0, 100).map((article) => (
              <article className="admin-article-row" key={article.id}>
                <div className="admin-article-meta">
                  <span>{article.language.toUpperCase()}</span>
                  <b>{article.feed_name}</b>
                  <small>{article.published_at || article.discovered_at}</small>
                </div>
                <a href={article.url} target="_blank" rel="noreferrer">
                  {article.title}
                </a>
              </article>
            ))}
          </div>
        </Surface>
      )}</>}
    </section>
  );
}
