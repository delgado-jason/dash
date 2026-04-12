"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { Input } from "./ui/input";

const DatePicker = ({ label, id, name }) => {
  const [date, setDate] = React.useState<Date>();
  const [inputValue, setInputValue] = React.useState("");

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
    console.log(inputValue);
  };

  return (
    <Field className="mx-auto w-44">
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        value={inputValue}
        onChange={handleInputChange}
      ></Input>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            id="date-picker"
            className="justify-start font-normal"
          >
            {date ? format(date, "PPP") : <span></span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            defaultMonth={date}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
};

export { DatePicker };
