/* Hojagas Gaming Portal - Core Logic */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Data Definitions
    const gamesData = [
        {
            title: "تحدي الصور",
            desc: "لعبة تحدي بالصور ممتعة وسهلة الفهم، تظهر على الشاشة صور تلمّح لاسم معين، وعلى اللاعبين تخمين الإجابة بأسرع وقت.",
            image: "tahadi_suwar.png",
            link: "https://salla.sa/maben-al8lob/azPxNZl",
            btnText: "اشتر الآن"
        },
        {
            title: "كرت جريء",
            desc: "🎯 جاوب بصراحة أو استعد تنكشف! 😈 تحديات جريئة واعترافات خطيرة للي عنده الجرأة يواجه الحقيقة.",
            image: "bold_card.png",
            link: "https://salla.sa/maben-al8lob/vAoxxEZ",
            btnText: "اشتر الآن"
        },
        {
            title: "مآبين آلقلوب 1",
            desc: "لعبة أسئلة عاطفية وعميقة (14.99 SAR)",
            image: "maben_alqlub_1.png",
            link: "https://salla.sa/maben-al8lob/qGedWrK",
            btnText: "اشتر الآن"
        },
        {
            title: "مآبين آلقلوب 2",
            desc: "لعبة بطابع عاطفي واجتماعي (29 SAR)",
            image: "maben_alqlub_2.png",
            link: "https://salla.sa/maben-al8lob/vAoxxEZ",
            btnText: "اشتر الآن"
        },
        {
            title: "حروف هوجاس",
            desc: "لعبة الحروف العربية الممتعة مع تحديات ذكية وتفاعل مباشر.",
            image: "hroof_game.png",
            link: "old.html",
            btnText: "اشتر الآن"
        },
        {
            title: "Neon Nexus",
            desc: "A rhythmic action-adventure through a high-fidelity cyberpunk world.",
            image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=800",
            link: "#",
            btnText: "Learn More"
        },
        {
            title: "Shadow Realm",
            desc: "Ultra-precise 2D platforming in a dark fantasy setting with epic bosses.",
            image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80&w=800",
            link: "#",
            btnText: "Learn More"
        }
    ];

    // 2. Navbar Scroll Effect
    const nav = document.getElementById('main-nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            nav.classList.add('scrolled', 'glass');
        } else {
            nav.classList.remove('scrolled');
        }
    });

    // 3. Inject Games Grid
    const gamesGrid = document.getElementById('games-grid');
    if (gamesGrid) {
        gamesGrid.innerHTML = ''; // Clear existing
        gamesData.forEach(game => {
            const card = document.createElement('div');
            card.className = 'game-card animate-fade-in';
            card.innerHTML = `
                <img src="${game.image}" alt="${game.title}">
                <div class="game-card-overlay">
                    <h3 style="font-family: 'Cairo', sans-serif;">${game.title}</h3>
                    <p style="font-size: 0.9rem; opacity: 0.9; margin-bottom: 20px; direction: rtl;">${game.desc}</p>
                    <a href="${game.link}" class="btn-primary" style="padding: 12px 25px; font-size: 1rem; font-family: 'Cairo', sans-serif;">${game.btnText || 'Learn More'}</a>
                </div>
            `;
            gamesGrid.appendChild(card);
        });
    }

    // 4. Animated Stats Counter
    const stats = document.querySelectorAll('.stat-number');
    const observerOptions = {
        threshold: 0.5
    };

    const statsObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = entry.target;
                const goal = parseInt(target.dataset.target);
                animateValue(target, 0, goal, 2000);
                observer.unobserve(target);
            }
        });
    }, observerOptions);

    stats.forEach(stat => statsObserver.observe(stat));

    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    // 5. Smooth Scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            e.preventDefault();
            const target = document.querySelector(targetId);
            if (target) {
                window.scrollTo({
                    top: target.offsetTop - 80,
                    behavior: 'smooth'
                });
            }
        });
    });

    // 6. Mobile Menu Toggle
    const mobileMenu = document.getElementById('mobile-menu');
    const navLinks = document.querySelector('.nav-links');
    if (mobileMenu) {
        mobileMenu.addEventListener('click', () => {
            navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
            navLinks.style.flexDirection = 'column';
            navLinks.style.position = 'absolute';
            navLinks.style.top = '100%';
            navLinks.style.left = '0';
            navLinks.style.width = '100%';
            navLinks.style.background = 'var(--primary-bg)';
            navLinks.style.padding = '20px';
        });
    }
});
