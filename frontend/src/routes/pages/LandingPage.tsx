import { Link } from 'react-router-dom'
import './LandingPage.css'

function DragonEye() {
  return (
    <div className="landing__eye-art" aria-hidden="true">
      <div className="landing__eye-glow" />
      <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-31or5WbUiO29shZebb40auUyLvSPZw.png" alt="" className="landing__eye-image" />
      <span className="landing__eye-caption">Твой мир просыпается</span>
    </div>
  )
}

function SceneImage({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return <img className={`landing__scene-image ${className}`} src={src} alt={alt} loading="lazy" />
}

export default function LandingPage() {
  return (
    <div className="landing">
      <section className="landing__hero" aria-labelledby="landing-hero-title">
        <div className="landing__hero-copy">
          <p className="landing__eyebrow">ДНДЭШИНГ / ПЛАТФОРМА ДЛЯ ПРИКЛЮЧЕНИЙ</p>
          <h1 id="landing-hero-title" className="landing__title">Место, где начинают приключения</h1>
          <p className="landing__subtitle">Создавай персонажей, собирай кампании и отправляйся в путь. Всё, что нужно герою и мастеру, — в одном живом мире.</p>
          <div className="landing__cta-group">
            <Link className="landing__cta landing__cta--primary" to="/register">Начать приключение</Link>
            <Link className="landing__cta landing__cta--secondary" to="/login">Уже есть аккаунт? Войти</Link>
          </div>
          <span className="landing__scroll-hint">Прокрути, чтобы разбудить дракона <span aria-hidden="true">↓</span></span>
        </div>
        <DragonEye />
      </section>

      <section className="landing__story landing__story--knight" aria-labelledby="landing-character-title">
        <div className="landing__story-copy">
          <p className="landing__eyebrow">ДЛЯ ИГРОКОВ</p>
          <h2 id="landing-character-title">Создавай персонажа шаг за шагом</h2>
          <p>Забудь о сотнях страниц «Книги игрока». Выбери путь, характер и способности — остальное подскажем мы.</p>
          <div className="landing__step-list" aria-label="Этапы создания персонажа">
            <span>01 Раса</span><span>02 Класс</span><span>03 Характеристики</span><span>04 Предыстория</span>
          </div>
          <Link className="landing__text-link" to="/register">Создать героя <span aria-hidden="true">↗</span></Link>
        </div>
        <SceneImage src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-Y7czvbgqVwzfW8tA2cJ2cf8w79VumZ.png" alt="Рыцарь отдыхает среди красных цветов в горах" />
      </section>

      <section className="landing__story landing__story--merchant" aria-labelledby="landing-master-title">
        <SceneImage src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-X3yFARGfitntEXoy8kwwBM7jgV4JUS.png" alt="Торговец в яркой одежде за прилавком с сокровищами" />
        <div className="landing__story-copy">
          <p className="landing__eyebrow">ДЛЯ МАСТЕРОВ</p>
          <h2 id="landing-master-title">Для мастера — живой мир</h2>
          <p>Создавай уникальных торговцев, жителей и союзников для каждого приключения. Дай игрокам мир, в который хочется возвращаться.</p>
          <div className="landing__feature-list"><span>Кампании и инвайты</span><span>Торговцы с экономикой</span><span>Листы партии на чтение</span></div>
          <Link className="landing__text-link" to="/register">Создать мир <span aria-hidden="true">↗</span></Link>
        </div>
      </section>

      <section className="landing__outro" aria-labelledby="landing-outro-title">
        <SceneImage src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-5zs3Wlq9WGGOM1ETHBDyBLaS9w9Khr.png" alt="Группа путешественников идёт по цветущей долине к вулкану" />
        <div className="landing__outro-scrim" />
        <div className="landing__outro-copy">
          <p className="landing__eyebrow">ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ</p>
          <h2 id="landing-outro-title">Готов отправиться в приключение?</h2>
          <p>Создай аккаунт и начни свою первую историю.</p>
          <Link className="landing__cta landing__cta--primary" to="/register">Отправиться в приключение</Link>
        </div>
      </section>

      <footer className="landing__footer"><span>ДНДЭШИНГ</span><span>Персонажи · Кампании · Истории</span></footer>
    </div>
  )
}
