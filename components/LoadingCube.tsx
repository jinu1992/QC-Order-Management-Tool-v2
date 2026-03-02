import React, { useEffect, useRef } from 'react';

interface LoadingCubeProps {
    label?: string;
    size?: string;
}

const LoadingCube: React.FC<LoadingCubeProps> = ({ label }) => {
    const lidRef = useRef<SVGPathElement>(null);
    const baseRef = useRef<SVGPathElement>(null);
    const cubeGroupRef = useRef<SVGGElement>(null);

    const lid_coordinates = [
        // lid outline
        [[-3, 3, 3], [-3, -3, 3], [3, -3, 3], [3, 3, 3], [-3, 3, 3], [-3, 3, 1], [-3, -3, 1], [3, -3, 1], [3, -3, 3]],
        // lid inner lines
        [[3, 1, 3], [-3, 1, 3], [-3, 1, 1]],
        [[3, -1, 3], [-3, -1, 3], [-3, -1, 1]],
        [[-3, -3, 3], [-3, -3, 1]],
        [[-1, -3, 1], [-1, -3, 3], [-1, 3, 3]],
        [[1, -3, 1], [1, -3, 3], [1, 3, 3]]
    ];

    const base_coordinates = [
        [[-3, 3, 1], [3, 3, 1], [3, -3, 1], [-3, -3, 1], [-3, 3, 1], [-3, 3, -3], [-3, -3, -3], [3, -3, -3], [3, -3, 1]],
        [[1, -3, -3], [1, -3, 1], [1, 1, 1], [-3, 1, 1], [-3, 1, -3]],
        [[-1, -3, -3], [-1, -3, 1], [-1, -1, 1], [-3, -1, 1], [-3, -1, -3]],
        [[-3, -3, -3], [-3, -3, 1]],
        [[-3, 3, -1], [-3, -3, -1], [3, -3, -1]]
    ];

    const u = 4; // size scale

    function project(coordinatesGroup: any[][][], t: number) {
        return coordinatesGroup.map((subGroup) => {
            return subGroup.map((coord) => {
                const x = coord[0];
                const y = coord[1];
                const z = coord[2];

                return [
                    (x * Math.cos(t) - y * Math.sin(t)) * u + 30,
                    (x * -Math.sin(t) - y * Math.cos(t) - z * Math.sqrt(2)) * u / Math.sqrt(3) + 30
                ];
            });
        });
    }

    function toPath(coordinates: any[]) {
        return 'M' + (JSON
            .stringify(coordinates)
            .replace(/]],\[\[/g, 'M')
            .replace(/],\[/g, 'L')
            .slice(3, -3)
        );
    }

    function easing(t: number) {
        return (2 - Math.cos(Math.PI * t)) % 2 * Math.PI / 4;
    }

    useEffect(() => {
        let t = 0;
        let animationFrameId: number;

        const tick = () => {
            t = (t + 1 / 45) % 3; // Timing speed adjustment
            
            if (cubeGroupRef.current) {
                cubeGroupRef.current.style.transform = `rotate(${Math.floor(t) * 120}deg)`;
            }

            if (lidRef.current) {
                lidRef.current.setAttribute('d', toPath(project(lid_coordinates, easing(t))));
            }

            if (baseRef.current && t === 0) {
                 // Static base only needs setting once or on reset
                baseRef.current.setAttribute('d', toPath(project(base_coordinates, Math.PI / 4)));
            }

            animationFrameId = requestAnimationFrame(tick);
        };

        // Initial base draw
        if (baseRef.current) {
            baseRef.current.setAttribute('d', toPath(project(base_coordinates, Math.PI / 4)));
        }

        tick();

        return () => cancelAnimationFrame(animationFrameId);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center py-6 animate-fade-in-up">
            <div className="relative">
                <svg 
                    viewBox="0 0 60 60" 
                    width="90" 
                    height="90"
                    stroke="#6D7582" 
                    strokeWidth="1.2"
                    strokeLinejoin="round" 
                    strokeLinecap="round"
                    className="bg-transparent overflow-visible"
                >
                    <g ref={cubeGroupRef} style={{ transformOrigin: '30px 30px', transition: 'transform 0.3s ease-out' }} fill="white">
                        <path ref={baseRef} />
                        <path ref={lidRef} />
                    </g>
                </svg>
                {/* Decorative shadow effect scaled by 50% */}
                <div className="absolute bottom-[-5px] left-1/2 -translate-x-1/2 w-12 h-2 bg-gray-200/50 rounded-[100%] blur-md -z-10"></div>
            </div>
            
            {label && (
                <div className="mt-6 text-center">
                    <p className="text-gray-400 font-black uppercase tracking-[0.3em] text-[10px] mb-2">
                        {label}
                    </p>
                    <div className="flex justify-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-partners-green animate-bounce" style={{ animationDelay: '0s' }}></div>
                        <div className="w-1 h-1 rounded-full bg-partners-green animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-1 h-1 rounded-full bg-partners-green animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LoadingCube;