// Правильно для Import Map:
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';


export class Building {
    constructor(canvas, onSelect) {
        this.canvas = canvas;
        this.onSelect = onSelect;
        this.panels = {}; // Хранилище зон для клика

        this._initScene();
        this._loadModel();
        this._initInteractions();
        this._animate();
        this._loadEnvironment(); 
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0d0f1a);

        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(10, 10, 10);

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        
        // Свет (важно для AI моделей)
        this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(5, 10, 7);
        this.scene.add(sun);
    }

_loadEnvironment() {
    const loader = new GLTFLoader();

    // Загрузка ПОЛА
    loader.load('./ground.glb', (gltf) => {
        const ground = gltf.scene;
        // Пол обычно должен быть в самом низу (под зданием)
        ground.position.set(0, -4.2, 0); 
        ground.scale.set(0.5, 0.5, 0.5); // Масштабируй по необходимости
        this.scene.add(ground);
    });

loader.load('./stairs.glb', (gltf) => {
    const stairs = gltf.scene;

    stairs.scale.set(0.1, 0.1, 0.1); 
    
    // --- ВРАЩЕНИЕ ---
    // Повернуть на 180 градусов (чтобы смотрела на здание)
    stairs.rotation.y = Math.PI; 

    // Если нужно на 90 градусов (вправо/влево)
    // stairs.rotation.y = Math.PI / 2; 

    // Если нужно на произвольный угол в градусах (например, 45°)
    // stairs.rotation.y = THREE.MathUtils.degToRad(45); 

    stairs.position.set(5, -4.5, 4); 
    this.scene.add(stairs);
});

}


    _loadModel() {
        const loader = new GLTFLoader();
        loader.load('./model.glb', (gltf) => {
            const model = gltf.scene;
            
            // 1. Авто-масштаб и центрирование
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 8 / maxDim; // Приводим к размеру 8 единиц
            
            model.scale.set(scale, scale, scale);
            model.position.sub(center.multiplyScalar(scale));
            
            this.scene.add(model);
            document.getElementById('status').textContent = "Здание загружено";
            
            // 2. Создаем зоны клика (упрощенно: 6 этажей)
            this._createHitboxes();
        }, undefined, (err) => {
            console.error("Ошибка загрузки GLB:", err);
            document.getElementById('status').textContent = "Ошибка загрузки!";
        });
        
    }

_createHitboxes() {
    const EDGES_COUNT = 6; // Количество граней (шестиугольник)
    
    const config = {
        radius: 2.8,          // Расстояние от центра до панели
        width: 3.2,           // Ширина панели (подбери под грань)
        height: 1.0,          // Высота кликабельной зоны
        depth: 0.3,           // Толщина (сделай побольше для удобства клика)
        floorHeight: 1.2,     // Расстояние между этажами
        yOffset: -4.4,       // Смещение всей сетки по вертикали
        
        // --- НАСТРОЙКА ВРАЩЕНИЯ (В ГРАДУСАХ) ---
        // Крути это число, чтобы совместить все блоки с гранями модели
        globalRotationDeg: 30, 
        
        // Корректировка поворота самой меши (обычно 90 градусов или PI/2)
        meshRotationOffset: Math.PI / 2 
    };

    // Переводим градусы в радианы для расчетов
    const globalOffsetRad = THREE.MathUtils.degToRad(config.globalRotationDeg);

    for (let f = 1; f <= 6; f++) {
        for (let e = 0; e < EDGES_COUNT; e++) {
            // Создаем геометрию и материал
            const geo = new THREE.BoxGeometry(config.width, config.height, config.depth);
            const mat = new THREE.MeshStandardMaterial({ 
                color: 0xff0000, 
                transparent: true, 
                opacity: 0.0,      // Видимость 30% для настройки (потом поставь 0)
                emissive: 0x000000,
                emissiveIntensity: 0
            });

            const mesh = new THREE.Mesh(geo, mat);
            
            // 1. Вычисляем базовый угол грани + добавляем глобальное смещение
            const angle = ((e * Math.PI * 2) / EDGES_COUNT) + globalOffsetRad; 
            
            // 2. Расставляем блоки по кругу (X и Z)
            mesh.position.set(
                Math.cos(angle) * config.radius, 
                (f * config.floorHeight) + config.yOffset, 
                Math.sin(angle) * config.radius
            );

            // 3. Разворачиваем блок "лицом" к центру с учетом смещения
            // Мы вычитаем angle, чтобы блок смотрел перпендикулярно радиусу
            mesh.rotation.y = -angle + config.meshRotationOffset;

            // Сохраняем данные этажа и грани
            mesh.userData = { floor: f, edge: e };
            
            // Добавляем в хранилище и на сцену
            this.panels[`${f}_${e}`] = mesh;
            this.scene.add(mesh);
        }
    }
    console.log(`Сетка хитбоксов создана. Поворот: ${config.globalRotationDeg}°`);
}



_initInteractions() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    window.addEventListener('click', (e) => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, this.camera);
        const intersects = raycaster.intersectObjects(Object.values(this.panels));

        if (intersects.length > 0) {
            // ВАЖНО: берем первый объект из массива [0]
            const data = intersects[0].object.userData; 
            
            this.onSelect(data.floor, data.edge);
            this.flash(data.floor, data.edge, 0x00ff00); // Зеленая вспышка
        }
    });
}



    // Тот самый метод для вспышек от бэкенда/WS
flash(floor, edge, color = 0x00ff00) {
    const panel = this.panels[`${floor}_${edge}`];
    if (panel) {
        // Делаем панель видимой и заставляем её светиться
        panel.material.opacity = 0.6; 
        panel.material.color.set(color);
        
        // Эффект свечения (работает, если в сцене есть свет)
        if (panel.material.emissive) {
            panel.material.emissive.set(color);
            panel.material.emissiveIntensity = 1;
        }

        // Через 800мс плавно (или резко) возвращаем невидимость
        setTimeout(() => {
            panel.material.opacity = 0;
            if (panel.material.emissive) {
                panel.material.emissive.set(0x000000);
            }
        }, 800);
    }
}


    _animate() {
        requestAnimationFrame(() => this._animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
