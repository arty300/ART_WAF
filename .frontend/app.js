import { Building } from './building.js';

const canvas = document.getElementById('building-canvas');
const info = document.getElementById('info');

const building = new Building(canvas, (floor, edge) => {
    info.textContent = `Выбрано: Этаж ${floor}, Стена ${edge}`;
    console.log("Клик!", floor, edge);
    
    // Тестовая вспышка при клике
    building.flash(floor, edge, 0xeab308);
});
