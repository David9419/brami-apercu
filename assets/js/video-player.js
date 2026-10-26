/**
 * Lecteur vidéo interactif (cahier des charges, section 6) — JavaScript natif, sans bibliothèque.
 *
 * Le service de diffusion est isolé derrière un ADAPTATEUR. Tout adaptateur expose :
 *   mount(container)  → Promise  : crée le lecteur (appelé seulement après le clic du visiteur)
 *   play()            → void     : lecture
 *   pause()           → void     : pause
 *   seek(seconds)     → void     : aller à un instant
 *   getTime()         → number   : instant courant en secondes
 *   isPaused()        → boolean
 * Pour ajouter un service (YouTube, Vimeo, PeerTube…), écrire un adaptateur de cette forme
 * dans `adapters`, puis l'associer à son adresse dans brami_video_provider() (PHP).
 * Le reste du lecteur (chapitres, repères, quiz) ne change pas.
 *
 * Aucune donnée n'est enregistrée (ni serveur, ni navigateur). Aucune lecture automatique.
 */
(() => {
	const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

	/* Adaptateurs ----------------------------------------------------------------- */

	const adapters = {
		/**
		 * Démonstration : horloge simulée, aucun fichier ni service. Clairement signalée à l'écran.
		 */
		demo(config) {
			let time = 0;
			let paused = true;
			let last = 0;
			let timer = null;
			let screen = null;

			const render = () => {
				if (!screen) {
					return;
				}
				const chapter = [...config.chapters].reverse().find((c) => c.time <= time);
				screen.querySelector('[data-demo-time]').textContent = `${fmt(time)} / ${fmt(config.duration)}`;
				screen.querySelector('[data-demo-chapter]').textContent = chapter ? chapter.title : config.title;
				screen.querySelector('[data-demo-bar]').style.transform = `scaleX(${time / config.duration})`;
			};

			const loop = () => {
				const now = performance.now();
				time = Math.min(config.duration, time + (now - last) / 1000);
				last = now;
				if (time >= config.duration) {
					paused = true;
					window.clearInterval(timer);
				}
				render();
			};

			return {
				mount(container) {
					screen = document.createElement('div');
					screen.className = 'vdemo';
					screen.innerHTML = `
						<p class="vdemo__flag">Démonstration</p>
						<p class="vdemo__chapter" data-demo-chapter></p>
						<p class="vdemo__time" data-demo-time></p>
						<span class="vdemo__bar"><span data-demo-bar></span></span>`;
					container.append(screen);
					render();
					return Promise.resolve();
				},
				play() {
					if (time >= config.duration) {
						time = 0;
					}
					paused = false;
					last = performance.now();
					window.clearInterval(timer);
					timer = window.setInterval(loop, 200);
				},
				pause() {
					paused = true;
					window.clearInterval(timer);
				},
				seek(seconds) {
					time = Math.max(0, Math.min(config.duration, seconds));
					last = performance.now();
					render();
				},
				getTime: () => time,
				isPaused: () => paused,
			};
		},

		/**
		 * Fichier vidéo direct (.mp4, .webm) lu par le navigateur, avec sous-titres français.
		 */
		file(config) {
			let video = null;
			return {
				mount(container) {
					video = document.createElement('video');
					video.controls = true;
					video.playsInline = true;
					video.preload = 'metadata';
					video.src = config.src;
					if (config.subtitles) {
						const track = document.createElement('track');
						track.kind = 'subtitles';
						track.srclang = 'fr';
						track.label = 'Français';
						track.src = config.subtitles;
						track.default = true;
						video.append(track);
					}
					container.append(video);
					return Promise.resolve();
				},
				play: () => video.play().catch(() => {}),
				pause: () => video.pause(),
				seek: (seconds) => { video.currentTime = seconds; },
				getTime: () => video.currentTime,
				isPaused: () => video.paused,
			};
		},
	};

	/* Lecteur ------------------------------------------------------------------- */

	document.querySelectorAll('[data-vplayer]').forEach((root) => {
		const config = JSON.parse(root.dataset.config || '{}');
		const createAdapter = adapters[config.provider];
		const startBtn = root.querySelector('[data-vplayer-start]');
		const poster = root.querySelector('[data-vplayer-poster]');
		const media = root.querySelector('[data-vplayer-media]');
		const hotspotLayer = root.querySelector('[data-vplayer-hotspots]');
		const controls = root.querySelector('[data-vplayer-controls]');
		const toggle = root.querySelector('[data-vplayer-toggle]');
		const progress = root.querySelector('[data-vplayer-progress]');
		const timeLabel = root.querySelector('[data-vplayer-time]');
		const live = root.querySelector('[data-vplayer-live]');
		const explain = document.querySelector('[data-vplayer-explain]');
		const chapters = [...document.querySelectorAll('[data-vplayer-seek]')];

		if (!createAdapter) {
			return; // Service externe sans adaptateur : le lien vers la vidéo reste proposé.
		}

		const adapter = createAdapter(config);
		let started = null;
		let ticker = null;
		let activeChapter = -1;

		const announce = (text) => {
			live.textContent = '';
			window.setTimeout(() => { live.textContent = text; }, 50);
		};

		// Repères : un bouton par repère, visible entre ses deux instants.
		const hotspotButtons = (config.hotspots || []).map((spot, index) => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'hotspot';
			button.hidden = true;
			button.style.setProperty('--i', index);
			button.innerHTML = `<span class="hotspot__pulse" aria-hidden="true"></span><span class="hotspot__label"></span>`;
			button.querySelector('.hotspot__label').textContent = spot.label;
			button.setAttribute('aria-label', `Repère : ${spot.label}. Afficher l'explication`);
			button.addEventListener('click', () => openExplanation(spot));
			hotspotLayer.append(button);
			return { spot, button };
		});

		const update = () => {
			const t = adapter.getTime();
			const paused = adapter.isPaused();
			if (progress && config.provider === 'demo') {
				progress.value = String(Math.floor(t));
				timeLabel.textContent = `${fmt(t)} / ${fmt(config.duration)}`;
			}
			if (toggle) {
				toggle.classList.toggle('is-playing', !paused);
				toggle.setAttribute('aria-label', paused ? 'Lecture' : 'Pause');
			}
			hotspotButtons.forEach(({ spot, button }) => {
				button.hidden = !(t >= spot.start && t < spot.end);
			});
			let current = -1;
			(config.chapters || []).forEach((chapter, index) => {
				if (t >= chapter.time) {
					current = index;
				}
			});
			if (current !== activeChapter) {
				activeChapter = current;
				chapters.forEach((button, index) => {
					if (index === current) {
						button.setAttribute('aria-current', 'true');
					} else {
						button.removeAttribute('aria-current');
					}
				});
			}
		};

		const start = () => {
			if (started) {
				return started;
			}
			poster.hidden = true;
			media.hidden = false;
			if (config.provider === 'demo') {
				controls.hidden = false;
			}
			started = adapter.mount(media).then(() => {
				ticker = window.setInterval(update, 250);
			});
			return started;
		};

		const play = () => start().then(() => { adapter.play(); update(); });

		const openExplanation = (spot) => {
			adapter.pause();
			update();
			explain.hidden = false;
			explain.querySelector('[data-vplayer-explain-title]').textContent = spot.label;
			explain.querySelector('[data-vplayer-explain-text]').textContent = spot.text;
			announce(`${spot.label}. ${spot.text}`);
			explain.setAttribute('tabindex', '-1');
			explain.focus();
		};

		if (startBtn) {
			startBtn.hidden = false;
			startBtn.addEventListener('click', () => {
				play().then(() => {
					const focusTarget = config.provider === 'demo' ? toggle : media.querySelector('video');
					if (focusTarget) {
						focusTarget.focus();
					}
				});
			});
		}

		if (toggle) {
			toggle.addEventListener('click', () => {
				if (adapter.isPaused()) {
					adapter.play();
					announce('Lecture');
				} else {
					adapter.pause();
					announce('Pause');
				}
				update();
			});
		}

		if (progress) {
			progress.addEventListener('input', () => {
				adapter.seek(Number(progress.value));
				update();
			});
		}

		chapters.forEach((button) => {
			button.disabled = false;
			button.addEventListener('click', () => {
				const seconds = Number(button.dataset.vplayerSeek);
				start().then(() => {
					adapter.seek(seconds);
					adapter.play();
					update();
					announce(`Chapitre : ${button.querySelector('.chapter__title').textContent}`);
				});
			});
		});

		if (explain) {
			explain.querySelector('[data-vplayer-explain-close]').addEventListener('click', () => {
				explain.hidden = true;
				adapter.play();
				update();
				(toggle && !controls.hidden ? toggle : root.querySelector('.vplayer__stage button, video'))?.focus();
			});
		}

		window.addEventListener('pagehide', () => window.clearInterval(ticker));
	});

	/* Quiz : aucune réponse ni score n'est enregistré --------------------------------- */

	document.querySelectorAll('[data-quiz]').forEach((quiz) => {
		const live = quiz.querySelector('[data-quiz-live]');
		const items = [...quiz.querySelectorAll('[data-quiz-item]')];
		quiz.hidden = false;

		const reset = () => {
			items.forEach((item) => {
				item.querySelectorAll('[data-quiz-answer]').forEach((button) => {
					button.classList.remove('is-correct', 'is-wrong');
					button.removeAttribute('aria-disabled');
					button.removeAttribute('aria-pressed');
				});
				item.querySelector('[data-quiz-feedback]').hidden = true;
				delete item.dataset.answered;
			});
			live.textContent = '';
		};

		items.forEach((item) => {
			const correct = Number(item.dataset.correct);
			const answers = [...item.querySelectorAll('[data-quiz-answer]')];
			answers.forEach((button) => {
				button.addEventListener('click', () => {
					if (item.dataset.answered) {
						return;
					}
					item.dataset.answered = '1';
					const chosen = Number(button.dataset.quizAnswer);
					const right = chosen === correct;
					answers.forEach((other) => other.setAttribute('aria-disabled', 'true'));
					button.setAttribute('aria-pressed', 'true');
					button.classList.add(right ? 'is-correct' : 'is-wrong');
					answers[correct].classList.add('is-correct');
					const verdict = right
						? 'Bonne réponse.'
						: `Ce n'est pas la bonne réponse. La bonne réponse est : ${answers[correct].textContent}.`;
					item.querySelector('[data-quiz-verdict]').textContent = verdict;
					const feedback = item.querySelector('[data-quiz-feedback]');
					feedback.hidden = false;
					live.textContent = `${verdict} ${feedback.querySelector('.quiz__explanation').textContent}`;
				});
			});
		});

		quiz.querySelector('[data-quiz-reset]').addEventListener('click', () => {
			reset();
			const first = quiz.querySelector('[data-quiz-answer]');
			if (first) {
				first.focus();
			}
		});
	});

	/* Animation pas à pas ------------------------------------------------------------ */

	document.querySelectorAll('[data-steps]').forEach((block) => {
		const steps = [...block.querySelectorAll('[data-step]')];
		const nav = block.querySelector('[data-steps-nav]');
		const prev = block.querySelector('[data-steps-prev]');
		const next = block.querySelector('[data-steps-next]');
		const ring = block.querySelector('[data-steps-ring]');
		const num = block.querySelector('[data-steps-num]');
		const dots = [...block.querySelectorAll('[data-steps-dot]')];
		const live = block.querySelector('[data-steps-live]');
		let index = 0;

		block.classList.add('is-enhanced');
		nav.hidden = false;

		const show = (i, announceIt = true) => {
			index = Math.max(0, Math.min(steps.length - 1, i));
			steps.forEach((step, n) => {
				step.hidden = n !== index;
				step.classList.toggle('is-current', n === index);
			});
			dots.forEach((dot, n) => dot.classList.toggle('is-done', n <= index));
			ring.style.strokeDashoffset = String(100 - (100 * (index + 1)) / steps.length);
			num.textContent = String(index + 1);
			prev.disabled = index === 0;
			next.disabled = index === steps.length - 1;
			if (announceIt) {
				live.textContent = `Étape ${index + 1} sur ${steps.length} : ${steps[index].querySelector('.steps-anim__title').lastChild.textContent.trim()}. ${steps[index].querySelector('p').textContent}`;
			}
		};

		// Un bouton qui devient inactif ne doit pas garder le focus : on le passe à l'autre.
		prev.addEventListener('click', () => {
			show(index - 1);
			if (prev.disabled) {
				next.focus();
			}
		});
		next.addEventListener('click', () => {
			show(index + 1);
			if (next.disabled) {
				prev.focus();
			}
		});
		show(0, false);
	});
})();
