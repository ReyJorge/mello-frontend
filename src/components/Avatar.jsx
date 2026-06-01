import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";

function AvatarModel(props) {
  const gltf = useGLTF("/models/pointing_forward.glb");
  return <primitive object={gltf.scene} {...props} />;
}

export default function Avatar() {
  return (
    <Canvas style={{ width: "400px", height: "400px" }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[0, 10, 5]} intensity={1} />
      <Suspense fallback={null}>
        <AvatarModel position={[0, -1, 0]} />
      </Suspense>
      <OrbitControls />
    </Canvas>
  );
}
