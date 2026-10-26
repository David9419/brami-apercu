/**
 * Brami Allergologie — interactions du site (JavaScript natif, sans dépendance).
 *
 * 1. En-tête transparent puis opaque au défilement, progression de lecture, parallaxe, liens internes.
 * 2. Sous-menus (clic, clavier, survol sur ordinateur).
 * 3. Menu mobile : ouverture, fermeture, focus piégé, touche Échap.
 * 4. Filtres des listes.
 * 5. Apparition des éléments au défilement.
 */
(() => {
	const root = document.documentElement;
	const desktop = window.matchMedia('(min-width: 1080px)');
	const canHover = window.matchMedia('(hover: hover)');

	/* 1. En-tête, progression de lecture, parallaxe ---------------------------- */

	const header = document.querySelector('[data-site-header]');
	const progress = document.querySelector('[data-scroll-progress]');
	const parallaxItems = [...document.querySelectorAll('[data-parallax]')];
	// Mouvement réduit seulement si le site est réglé pour respecter la préférence du visiteur
	// (option du menu Cabinet, classe .respect-reduced-motion sur <html>).
	const reduceMotion = {
		get matches() {
			return root.classList.contains('respect-reduced-motion') && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		},
	};

	let ticking = false;
	const onScroll = () => {
		const y = window.scrollY;
		if (header) {
			// Transparent tout en haut de la page, opaque et flouté dès qu'on descend.
			header.classList.toggle('is-top', y < 12);
		}
		if (progress) {
			const max = document.documentElement.scrollHeight - window.innerHeight;
			progress.parentElement.style.setProperty('--progress', max > 0 ? String(Math.min(1, y / max)) : '0');
		}
		if (!reduceMotion.matches) {
			parallaxItems.forEach((item) => {
				const speed = Number(item.dataset.parallax) || 0.12;
				item.style.setProperty('--parallax', String(Math.round(y * speed)));
			});
		}
		ticking = false;
	};
	window.addEventListener('scroll', () => {
		if (!ticking) {
			window.requestAnimationFrame(onScroll);
			ticking = true;
		}
	}, { passive: true });
	onScroll();

	// Lien vers une section de la même page : défilement doux (CSS) puis brève mise en valeur.
	document.addEventListener('click', (event) => {
		const link = event.target.closest('a[href*="#"]');
		if (!link || link.classList.contains('skip-link')) {
			return;
		}
		const url = new URL(link.href, window.location.href);
		if (url.pathname !== window.location.pathname || !url.hash) {
			return;
		}
		const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
		if (target) {
			window.setTimeout(() => {
				target.classList.remove('is-target-flash');
				void target.offsetWidth; // Relance l'animation si on clique deux fois.
				target.classList.add('is-target-flash');
			}, 350);
		}
	});

	/* 2. Sous-menus ---------------------------------------------------------- */

	const toggles = [...document.querySelectorAll('[data-submenu-toggle]')];

	const setSubmenu = (toggle, open) => {
		toggle.setAttribute('aria-expanded', String(open));
		if (header) {
			// Voile flouté sous le méga-menu (ordinateur) tant qu'un panneau est ouvert.
			const anyOpen = toggles.some((t) => t.getAttribute('aria-expanded') === 'true');
			header.classList.toggle('has-mega-open', anyOpen && desktop.matches);
		}
	};

	const closeAllSubmenus = (except = null) => {
		toggles.forEach((toggle) => {
			if (toggle !== except) {
				setSubmenu(toggle, false);
			}
		});
	};

	toggles.forEach((toggle) => {
		const item = toggle.closest('li');
		const submenu = document.getElementById(toggle.getAttribute('aria-controls'));
		let hoverTimer = null;

		toggle.addEventListener('click', () => {
			const open = toggle.getAttribute('aria-expanded') !== 'true';
			if (desktop.matches) {
				closeAllSubmenus(toggle);
			}
			setSubmenu(toggle, open);
		});

		// Survol (ordinateur uniquement), avec un court délai à la fermeture.
		item.addEventListener('pointerenter', (event) => {
			if (event.pointerType !== 'mouse' || !desktop.matches || !canHover.matches) {
				return;
			}
			window.clearTimeout(hoverTimer);
			closeAllSubmenus(toggle);
			setSubmenu(toggle, true);
		});
		item.addEventListener('pointerleave', (event) => {
			if (event.pointerType !== 'mouse' || !desktop.matches) {
				return;
			}
			hoverTimer = window.setTimeout(() => setSubmenu(toggle, false), 180);
		});

		// Échap referme le sous-menu et rend le focus au bouton.
		item.addEventListener('keydown', (event) => {
			if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
				event.stopPropagation();
				setSubmenu(toggle, false);
				toggle.focus();
			}
		});

		// Sur ordinateur, quitter le sous-menu au clavier le referme.
		item.addEventListener('focusout', (event) => {
			if (desktop.matches && !item.contains(event.relatedTarget)) {
				setSubmenu(toggle, false);
			}
		});

		if (submenu) {
			submenu.addEventListener('click', (event) => {
				if (event.target.closest('a')) {
					setSubmenu(toggle, false);
				}
			});
		}
	});

	document.addEventListener('click', (event) => {
		if (desktop.matches && !event.target.closest('.primary-nav__item.has-children')) {
			closeAllSubmenus();
		}
	});

	// Échap ferme aussi un méga-menu ouvert au survol, où que soit le focus.
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && desktop.matches) {
			closeAllSubmenus();
		}
	});

	/* 3. Menu mobile --------------------------------------------------------- */

	const menuToggle = document.querySelector('[data-menu-toggle]');
	const nav = document.querySelector('[data-primary-nav]');

	if (header && menuToggle && nav) {
		const label = menuToggle.querySelector('.menu-toggle__label');
		const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

		const isOpen = () => menuToggle.getAttribute('aria-expanded') === 'true';

		const setMenu = (open, { returnFocus = true } = {}) => {
			// Le panneau commence sous l'en-tête, quelle que soit sa hauteur du moment.
			header.style.setProperty('--nav-top', `${header.getBoundingClientRect().bottom}px`);
			menuToggle.setAttribute('aria-expanded', String(open));
			header.classList.toggle('is-menu-open', open);
			root.classList.toggle('has-menu-open', open);
			if (label) {
				label.textContent = open ? label.dataset.labelClose : label.dataset.labelOpen;
			}
			if (open) {
				const first = nav.querySelector(focusableSelector);
				if (first) {
					window.setTimeout(() => first.focus(), 50);
				}
			} else {
				closeAllSubmenus();
				if (returnFocus) {
					menuToggle.focus();
				}
			}
		};

		menuToggle.addEventListener('click', () => setMenu(!isOpen()));

		document.addEventListener('keydown', (event) => {
			if (!isOpen()) {
				return;
			}
			if (event.key === 'Escape') {
				setMenu(false);
				return;
			}
			// Focus piégé dans l'en-tête (logo, panneau, bouton de menu) tant que le menu est ouvert,
			// dans l'ordre du document : le panneau précède le bouton de menu.
			if (event.key === 'Tab') {
				const focusables = [...header.querySelectorAll(focusableSelector)]
					.filter((el) => el.getClientRects().length > 0);
				const first = focusables[0];
				const last = focusables[focusables.length - 1];
				if (event.shiftKey && document.activeElement === first) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first.focus();
				}
			}
		});

		// Un lien suivi dans le panneau referme le menu.
		nav.addEventListener('click', (event) => {
			if (isOpen() && event.target.closest('a')) {
				setMenu(false, { returnFocus: false });
			}
		});

		// Passage en largeur ordinateur : le menu mobile n'a plus lieu d'être.
		desktop.addEventListener('change', (event) => {
			if (event.matches && isOpen()) {
				setMenu(false, { returnFocus: false });
			}
		});
	}

	/* 4. Filtres des listes (pathologies, vidéos) ---------------------------------- */

	document.querySelectorAll('[data-filters]').forEach((filters) => {
		const list = filters.parentElement.querySelector('[data-filter-list]');
		const status = filters.querySelector('[data-filter-status]');
		const chips = [...filters.querySelectorAll('[data-filter]')];
		if (!list) {
			return;
		}

		chips.forEach((chip) => {
			chip.addEventListener('click', () => {
				const value = chip.dataset.filter;
				chips.forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
				let count = 0;
				list.querySelectorAll(':scope > li').forEach((item) => {
					const match = value === '*' || item.dataset.category.split(' ').includes(value);
					item.hidden = !match;
					if (match) {
						item.classList.add('is-revealed');
						count += 1;
					}
				});
				if (status) {
					status.textContent = `${count} ${count > 1 ? 'fiches affichées' : 'fiche affichée'}`;
				}
			});
		});
	});

	/* Parcours patient : ligne qui se remplit au défilement et allume les étapes ---- */

	document.querySelectorAll('[data-journey]').forEach((flow) => {
		const fill = flow.querySelector('.journey__fill');
		const steps = [...flow.querySelectorAll('.journey__step')];
		const icons = steps.map((step) => step.querySelector('.journey__icon'));
		if (!fill || icons.length < 2 || icons.some((icon) => !icon)) {
			return;
		}
		let vertical = false;
		let length = 0;
		let stops = [];

		// Position dans le bloc, sans tenir compte des animations d'apparition en cours.
		const centre = (icon) => {
			let x = icon.offsetWidth / 2;
			let y = icon.offsetHeight / 2;
			for (let el = icon; el && el !== flow; el = el.offsetParent) {
				x += el.offsetLeft;
				y += el.offsetTop;
			}
			return { x, y };
		};

		const layout = () => {
			const points = icons.map(centre);
			const first = points[0];
			const last = points[points.length - 1];
			vertical = Math.abs(last.y - first.y) > Math.abs(last.x - first.x);
			flow.classList.toggle('is-vertical', vertical);
			length = vertical ? last.y - first.y : last.x - first.x;
			stops = points.map((p) => (vertical ? p.y - first.y : p.x - first.x) / length);
			flow.style.setProperty('--track-left', `${first.x - (vertical ? 1 : 0)}px`);
			flow.style.setProperty('--track-top', `${first.y - (vertical ? 0 : 1)}px`);
			flow.style.setProperty('--track-width', vertical ? '2px' : `${length}px`);
			flow.style.setProperty('--track-height', vertical ? `${length}px` : '2px');
			flow.classList.add('is-ready');
			update();
		};

		// La ligne suit le défilement avec un temps de retard (lissage), pour un mouvement lent et fluide.
		let target = 0;
		let current = 0;
		let running = false;

		const draw = () => {
			current += (target - current) * 0.08;
			if (Math.abs(target - current) < 0.0005) {
				current = target;
			}
			fill.style.setProperty('--fill', `${(current * length).toFixed(1)}px`);
			steps.forEach((step, i) => step.classList.toggle('is-reached', current >= stops[i] - 0.002));
			running = current !== target;
			if (running) {
				requestAnimationFrame(draw);
			}
		};

		const update = () => {
			const box = flow.getBoundingClientRect();
			const vh = window.innerHeight;
			let progress;
			if (vertical) {
				// Le point suit le milieu de l'écran.
				progress = (vh * 0.55 - (box.top + centre(icons[0]).y)) / length;
			} else {
				// La ligne se remplit pendant que la rangée monte de 90 % à 30 % de l'écran.
				progress = (vh * 0.9 - box.top) / (vh * 0.6);
			}
			target = Math.min(1, Math.max(0, progress));
			if (!running) {
				running = true;
				requestAnimationFrame(draw);
			}
		};

		layout();
		window.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', () => requestAnimationFrame(layout));
		window.addEventListener('load', layout);
	});

	/* 5. Apparition au défilement --------------------------------------------- */

	/* Apparition automatique des blocs sans data-reveal, sous la ligne de flottaison :
	   titres par la gauche, photos en zoom, textes en fondu flouté, cartes par la droite
	   ou la gauche en alternance. */
	const autoTargets = [
		['.site-main h2', 'left'],
		['.site-main figure, .site-main .card__media, .site-main picture', 'scale'],
		['.site-main .prose > p, .site-main .prose > ul, .site-main .prose > ol, .site-main .lead', 'blur'],
		['.site-main .card, .site-main .info-tile, .site-main .callout, .site-main .sheet-block, .site-main blockquote, .site-main details', 'side'],
	];
	let side = 0;
	autoTargets.forEach(([selector, variant]) => {
		document.querySelectorAll(selector).forEach((el) => {
			if (el.closest('[data-reveal]') || el.querySelector('[data-reveal]') || el.closest('.sheet-hero, .hero, .site-header, .doctolib-float-wrap')) {
				return;
			}
			if (el.getBoundingClientRect().top < window.innerHeight) {
				return;
			}
			el.dataset.reveal = variant === 'side' ? (side++ % 2 ? 'right' : 'left') : variant;
		});
	});

	const revealables = document.querySelectorAll('[data-reveal]');
	root.classList.add('reveal-ready');

	if (!('IntersectionObserver' in window) || reduceMotion.matches) {
		revealables.forEach((el) => el.classList.add('is-revealed'));
	} else {
		const observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					entry.target.classList.add('is-revealed');
					observer.unobserve(entry.target);
				}
			});
		}, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
		revealables.forEach((el) => observer.observe(el));
	}
})();
