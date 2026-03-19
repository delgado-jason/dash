const AppHeader = () => {
  return (
    <div className="flex justify-between bg-blue-100 p-4">
      <div>Dash</div>
      <div className="flex justify-between w-full max-w-40">
        <div className="ml-2">User</div>
        <div className="ml-2">Login/Logout</div>
      </div>
    </div>
  );
};

export default AppHeader;
