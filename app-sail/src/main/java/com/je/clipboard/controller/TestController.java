package com.zoho.ai.helloapp.controller;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/ping")
public class TestController
{
    @GetMapping(produces = MediaType.TEXT_PLAIN_VALUE)
    public String ping()
    {
        return "ok";
    }
}
