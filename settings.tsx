/* Four automatic palettes. Layout and the meaning of lesson/status colors stay stable. */
:root,
:root[data-season="autumn"] {
  color-scheme: light;
  --ink: #352b29;
  --muted: #786b62;
  --bg: #fbf7f2;
  --surface: #fffefd;
  --line: #eaded2;
  --navy: #392a27;
  --accent: #994c30;
  --accent-strong: #773d29;
  --accent-soft: #f7eadb;
  --accent-tint: #fcf4ea;
  --accent-border: #d9b899;
  --mint: #f2ddc4;
  --green: #994c30;
  --banner-start: #f2d9b9;
  --banner-end: #fbedda;
  --ornament: #b57631;
  --nav-hover: #513b33;
  --nav-active: #654637;
  --nav-accent: #f4ce9a;
  --nav-text: #ead8cb;
  --nav-muted: #c8b0a0;
  --nav-line: #674b40;
}

:root[data-season="winter"] {
  --ink: #24354b;
  --muted: #5d6f82;
  --bg: #f3f7fc;
  --surface: #ffffff;
  --line: #dde6f0;
  --navy: #20324e;
  --accent: #3963a5;
  --accent-strong: #2d518e;
  --accent-soft: #e8effb;
  --accent-tint: #f2f6fe;
  --accent-border: #b0c4e5;
  --mint: #d7e5fa;
  --green: #3963a5;
  --banner-start: #d7e7fb;
  --banner-end: #eef1ff;
  --ornament: #6578b3;
  --nav-hover: #2c4160;
  --nav-active: #354f77;
  --nav-accent: #c8defd;
  --nav-text: #e0e9fa;
  --nav-muted: #b2c4e0;
  --nav-line: #475e7e;
}

:root[data-season="spring"] {
  --ink: #2b3d34;
  --muted: #5f735f;
  --bg: #f6f9f3;
  --surface: #ffffff;
  --line: #e0e9db;
  --navy: #263d32;
  --accent: #49764d;
  --accent-strong: #345d3c;
  --accent-soft: #eaf3e3;
  --accent-tint: #f3f8ee;
  --accent-border: #b0c7a4;
  --mint: #dcebcf;
  --green: #49764d;
  --banner-start: #ddebcf;
  --banner-end: #f3eee7;
  --ornament: #a5768a;
  --nav-hover: #344f3e;
  --nav-active: #425f46;
  --nav-accent: #d5e9bc;
  --nav-text: #e0ecd7;
  --nav-muted: #b6c8b1;
  --nav-line: #4b6752;
}

:root[data-season="summer"] {
  --ink: #283b3b;
  --muted: #5e7371;
  --bg: #f7faf6;
  --surface: #fffefa;
  --line: #dde9e0;
  --navy: #203c3d;
  --accent: #23756f;
  --accent-strong: #1d5d59;
  --accent-soft: #e3f3e9;
  --accent-tint: #f0f8f2;
  --accent-border: #a4cabe;
  --mint: #ccebe0;
  --green: #23756f;
  --banner-start: #d2eee1;
  --banner-end: #fff0c8;
  --ornament: #a17a28;
  --nav-hover: #2b4e4b;
  --nav-active: #32625a;
  --nav-accent: #f4dda0;
  --nav-text: #e0ece0;
  --nav-muted: #b7ccc2;
  --nav-line: #486d65;
}

/* Navigation, selection and decoration follow one palette everywhere. */
:root[data-season] body { background: var(--bg); color: var(--ink); }
:root[data-season] ::selection { background: var(--mint); color: var(--accent-strong); }
:root[data-season] :is(button, a, input, textarea):focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
:root[data-season] .sidebar { color: var(--nav-text); }
:root[data-season] :is(.brand-dot, .nav-item.active svg, .tiny-orbit) { color: var(--nav-accent); }
:root[data-season] .brand-mark i { background: var(--nav-accent); }
:root[data-season] .brand-mark i:nth-child(2) { background: var(--ornament); }
:root[data-season] .brand-mark i:nth-child(3) { background: var(--accent-border); }
:root[data-season] :is(.academy, .sidebar-group, .sidebar-bottom>a) { border-color: var(--nav-line); }
:root[data-season] :is(.academy-symbol, .academy div>span, .nav-label, .sidebar-group small, .sidebar-group>svg, .sidebar-note strong, .sidebar-footer) { color: var(--nav-muted); }
:root[data-season] :is(.nav-item, .sidebar-note, .sidebar-bottom>a) { color: var(--nav-text); }
:root[data-season] .nav-item:hover { background: var(--nav-hover); }
:root[data-season] .nav-item.active { background: var(--nav-active); color: #fff; }
:root[data-season] .nav-item i { background: var(--nav-accent); }
:root[data-season] :is(.group-avatar, .nav-count) { background: var(--nav-active); color: var(--nav-accent); }
:root[data-season] :is(.primary-button:hover, .save-homework:hover) { background: var(--nav-hover); }
:root[data-season] .primary-button:disabled { background: var(--line); color: var(--muted); }

:root[data-season] :is(.topbar, .mobile-bottom-nav) { background: var(--surface); border-color: var(--line); }
:root[data-season] :is(.group-panel, .feature-row>div, .group-switch, .week-rail, .month-calendar, .week-summary, .source-top, .group-option, .sport-step-options>button, .homework-editor, .task-card, .task-filter button, .empty-state, .lesson-card) { background: var(--surface); border-color: var(--line); }
:root[data-season] .lesson-card.is-past:not(.is-cancelled) { background: var(--bg); }
:root[data-season] :is(.top-breadcrumb strong, .moscow-time, .telegram-loading, .task-content) { color: var(--ink); }
:root[data-season] :is(.top-breadcrumb, .moscow-time>span, .page-eyebrow, .onboarding-heading p, .dashboard-heading p, .panel-heading p, .group-option small, .group-panel-footer>p, .bottom-note, .feature-row p, .group-switch small, .list-heading, .group-empty p, .empty-state p, .schedule-footer, .app-footer, .lesson-time>span, .lesson-time>small, .lesson-meta>span, .lesson-meta .lesson-room, .day-section-title>span, .day-section-title h3>span, .summary-types>div, .week-count>span:nth-child(2)) { color: var(--muted); }
:root[data-season] :is(.search-field, .homework-editor textarea, .task-empty, .lesson-dialog) { background: var(--bg); border-color: var(--line); }
:root[data-season] :is(.search-field input::placeholder, .homework-editor textarea::placeholder) { color: var(--muted); }
:root[data-season] :is(.search-field:focus-within, .group-switch:hover, .lesson-card:hover) { border-color: var(--accent-border); box-shadow: 0 0 0 3px var(--accent-soft); }
:root[data-season] .group-list { scrollbar-color: var(--accent-border) transparent; }
:root[data-season] :is(.group-option:hover, .group-option.selected, .sport-step-options>button.selected) { background: var(--accent-tint); border-color: var(--accent-border); }
:root[data-season] :is(.group-option.selected .radio-dot, .sport-step-options .selected .radio-dot, .task-check.checked) { background: var(--accent); border-color: var(--accent); color: #fff; }
:root[data-season] :is(.profile-button, .feature-icon.green, .step-badge, .group-option.selected .group-option-icon, .sport-step-icon, .selected .sport-step-icon, .summary-icon, .empty-state>span, .recent-groups button, .semester-pill, .open-mini-calendar, .calendar-collapse) { background: var(--accent-soft); color: var(--accent-strong); border-color: var(--accent-border); }
:root[data-season] :is(.heading-dot, .onboarding h1>span, .text-button, .load-more, .setup-progress .current, .setup-progress .complete, .group-switch>svg, .sport-step-note, .sport-step-options small) { color: var(--accent); }
:root[data-season] :is(.text-button:hover, .load-more:hover, .lesson-open:hover .lesson-content h4) { color: var(--accent-strong); }
:root[data-season] :is(.page-eyebrow>span, .semester-pill>span) { background: var(--accent); }
:root[data-season] .setup-progress i { background: var(--line); }

/* Season-tinted panels and the existing calendar illustration. */
:root[data-season] :is(.welcome-card, .day-banner, .homework-board-intro) { background: linear-gradient(115deg, var(--banner-start), var(--banner-end)); border-color: var(--accent-border); }
:root[data-season] :is(.welcome-card h2, .day-banner h2, .homework-board-intro h2, .tasks-remaining) { color: var(--accent-strong); }
:root[data-season] :is(.welcome-card>p, .welcome-foot, .day-banner p, .banner-details, .homework-board-intro p, .tasks-remaining small, .banner-eyebrow) { color: var(--accent-strong); }
:root[data-season] :is(.welcome-tag, .round-arrow) { color: var(--accent-strong); border-color: var(--accent-border); background: var(--accent-soft); }
:root[data-season] .banner-type { background: var(--accent-soft); color: var(--accent-strong); }
:root[data-season] .banner-eyebrow>span { background: var(--accent); }
:root[data-season] :is(.day-banner h2>span, .art-star) { color: var(--ornament); }
:root[data-season] .calendar-paper { border-color: var(--accent-border); }
:root[data-season] .calendar-paper.back { background: var(--accent); border-color: var(--accent); }
:root[data-season] .calendar-paper.front { background: var(--surface); }
:root[data-season] .paper-rings i { background: var(--accent-strong); }
:root[data-season] .paper-label { color: var(--accent); border-color: var(--line); }
:root[data-season] .paper-grid>i { background: var(--accent-soft); }
:root[data-season] .paper-grid>.marked { background: var(--accent); }
:root[data-season] .paper-grid>.minted { background: var(--mint); }
:root[data-season] .orbit { border-color: var(--accent-border); opacity: .6; }
:root[data-season] .art-sticker { background: var(--surface); border-color: var(--line); }

/* The chosen day and month calendar use the same accent. */
:root[data-season] :is(.week-rail-day, .month-weekday.weekend) { color: var(--accent-strong); }
:root[data-season] :is(.week-rail-day>span, .month-eyebrow, .month-calendar-heading h2>span, .month-weekday, .month-calendar-legend, .month-calendar-legend small) { color: var(--muted); }
:root[data-season] :is(.week-rail-arrow, .icon-button) { color: var(--muted); }
:root[data-season] :is(.week-rail-day:hover, .week-rail-arrow:hover, .icon-button:hover, .today-button:hover, .month-day:hover, .month-day.weekend) { background: var(--accent-tint); }
:root[data-season] .compact-calendar .month-day.in-week:not(.selected) { background: var(--accent-tint); }
:root[data-season] .week-rail-day.selected { background: var(--mint); color: var(--accent-strong); }
:root[data-season] :is(.week-rail-day.selected>span, .week-rail-day.current>span) { color: var(--accent-strong); }
:root[data-season] :is(.week-rail-day>i.has-lessons, .week-rail-day.selected>strong:after, .week-rail-day.current:after, .month-day.current:before, .month-class-dots>i) { background: var(--accent); }
:root[data-season] .month-day { background: var(--surface); color: var(--ink); }
:root[data-season] .month-day.current { background: var(--accent-tint); border-color: var(--accent); color: var(--accent-strong); }
:root[data-season] :is(.month-day.selected, .compact-calendar .month-day.selected) { background: var(--accent); border-color: var(--accent); color: #fff; }
:root[data-season] :is(.month-day.selected.current:before, .month-day.selected .month-class-dots>i) { background: #fff; }
:root[data-season] .selected-key { background: var(--accent); }
:root[data-season] .today-key { border-color: var(--accent); }
:root[data-season] .weekend-key { background: var(--accent-soft); }
:root[data-season] :is(.month-calendar-legend, .app-footer, .task-card-footer, .monitor-details) { border-color: var(--line); }
:root[data-season] :is(.view-toggle, .type-filters button.active) { background: var(--accent-soft); border-color: var(--line); color: var(--accent-strong); }
:root[data-season] .view-toggle .selected { color: var(--accent-strong); background: var(--surface); }
:root[data-season] :is(.today-button, .view-toggle button, .type-filters button) { color: var(--muted); }
:root[data-season] .day-section-title em { background: var(--accent-soft); color: var(--accent-strong); }
:root[data-season] .lesson-card.is-active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }

/* Personal tasks, dialog and mobile navigation. Status colors remain semantic. */
:root[data-season] :is(.source-card, .monitor-panel, .homework-access, .assignment-target, .incoming-homework) { background: var(--accent-tint); border-color: var(--line); }
:root[data-season] :is(.source-card h3, .source-card a, .source-card-icon, .monitor-panel strong, .monitor-symbol, .editor-heading label, .assignment-target strong, .incoming-homework h3, .incoming-homework p) { color: var(--accent-strong); }
:root[data-season] :is(.source-card p, .monitor-panel small, .monitor-details, .monitor-panel>summary>svg, .change-date, .change-item p, .history-empty p, .dialog-top, .dialog-meta, .homework-access, .assignment-target span, .assignment-target p, .incoming-homework p>small, .reminder-option small, .manual-deadline, .editor-hint, .assignment-done) { color: var(--muted); }
:root[data-season] :is(.source-card a, .source-card-icon>span, .change-item, .reminder-option) { border-color: var(--line); }
:root[data-season] :is(.monitor-symbol, .dialog-top .icon-button, .task-deadline:not(.overdue), .secondary-button) { background: var(--accent-soft); color: var(--accent-strong); border-color: var(--accent-border); }
:root[data-season] :is(.assignment-target, .reminder-option, .reminder-option>svg, .history-empty, .task-card-footer button, .task-check:not(.checked)) { color: var(--accent); }
:root[data-season] :is(.manual-deadline input, .task-check) { border-color: var(--accent-border); }
:root[data-season] .manual-deadline input { color: var(--accent-strong); background: var(--surface); }
:root[data-season] :is(.reminder-option input, .assignment-done input) { accent-color: var(--accent); }
:root[data-season] .task-filter button.active { background: var(--navy); color: #fff; border-color: var(--navy); }
:root[data-season] .task-filter button.active>span { background: var(--nav-active); color: var(--nav-accent); }
:root[data-season] .mobile-bottom-nav>button { color: var(--muted); }
:root[data-season] .mobile-bottom-nav>button.active { background: var(--accent-soft); color: var(--accent-strong); }
:root[data-season] .mobile-nav-icon>i { background: var(--accent); border-color: var(--surface); }

.season-badge { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 10px; border: 1px solid var(--accent-border); border-radius: 30px; background: var(--accent-soft); color: var(--accent-strong); font-size: 10px; font-weight: 550; white-space: nowrap; }
@media (max-width: 700px) {
  .season-badge { padding: 7px; width: 30px; height: 30px; }
  .season-badge>span { display: none; }
  .top-actions { gap: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  :root[data-season] *, :root[data-season] *::before, :root[data-season] *::after { animation: none !important; scroll-behavior: auto !important; transition: none !important; }
}
