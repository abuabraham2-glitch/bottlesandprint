import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

const Index = () => {
  const navigate = useNavigate();
  useEffect(() => { navigate("/", { replace: true }); }, []);
  return null;
};

export default Index;
